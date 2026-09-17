const {
    Op,
} = require("sequelize");

const {
    ReviewRequest,
    User,
    Location,
} = require("../models");


function getDelayMinutes() {
    return Number(
        process.env
            .REVIEW_REQUEST_DELAY_MINUTES ||
        20
    );
}


function getCooldownDays() {
    return Number(
        process.env
            .REVIEW_REQUEST_COOLDOWN_DAYS ||
        60
    );
}


function getYandexReviewUrl(
    location
) {
    if (
        !location ||
        !location.code
    ) {
        return "";
    }


    const envKey =
        `YANDEX_REVIEW_URL_${
            String(
                location.code
            )
                .toUpperCase()
                .replace(
                    /[^A-Z0-9]/g,
                    "_"
                )
        }`;


    return String(
        process.env[
            envKey
            ] ||
        ""
    ).trim();
}


async function scheduleReviewRequest({
                                         userId,
                                         locationId,
                                         redemptionId,
                                     }) {
    const cooldownMs =
        getCooldownDays() *
        24 *
        60 *
        60 *
        1000;


    const cooldownFrom =
        new Date(
            Date.now() -
            cooldownMs
        );


    /*
     * Если недавно уже просили
     * отзыв для ЭТОЙ точки,
     * второй раз не беспокоим.
     */
    const existingRecent =
        await ReviewRequest.findOne({
            where: {
                user_id:
                userId,

                location_id:
                locationId,

                status: {
                    [Op.in]: [
                        "pending",
                        "sent",
                        "failed",
                    ],
                },

                createdAt: {
                    [Op.gte]:
                    cooldownFrom,
                },
            },

            order: [
                ["id", "DESC"],
            ],
        });


    if (existingRecent) {
        return {
            scheduled:
                false,

            reason:
                "cooldown",

            request:
            existingRecent,
        };
    }


    const delayMinutes =
        getDelayMinutes();


    const scheduledAt =
        new Date(
            Date.now() +
            delayMinutes *
            60 *
            1000
        );


    const [
        request,
        created,
    ] =
        await ReviewRequest
            .findOrCreate({
                where: {
                    redemption_id:
                    redemptionId,
                },

                defaults: {
                    user_id:
                    userId,

                    location_id:
                    locationId,

                    status:
                        "pending",

                    scheduled_at:
                    scheduledAt,

                    attempts:
                        0,
                },
            });


    return {
        scheduled:
        created,

        reason:
            created
                ? "created"
                : "already_exists",

        request,
    };
}


async function runReviewRequests(
    bot
) {
    const requests =
        await ReviewRequest.findAll({
            where: {
                status: {
                    [Op.in]: [
                        "pending",
                        "failed",
                    ],
                },

                scheduled_at: {
                    [Op.lte]:
                        new Date(),
                },

                attempts: {
                    [Op.lt]:
                        5,
                },
            },

            order: [
                ["scheduled_at", "ASC"],
            ],

            limit:
                50,
        });


    for (
        const request
        of requests
        ) {
        const user =
            await User.findByPk(
                request.user_id
            );


        const location =
            await Location.findByPk(
                request.location_id
            );


        if (
            !user ||
            user.status !== "active" ||
            !user.telegram_id ||
            !location ||
            !location.is_active
        ) {
            await request.update({
                status:
                    "cancelled",
            });

            continue;
        }


        const reviewUrl =
            getYandexReviewUrl(
                location
            );


        /*
         * Ссылку ещё не настроили —
         * запрос оставляем pending.
         */
        if (!reviewUrl) {
            continue;
        }


        try {
            await bot.telegram
                .sendMessage(
                    String(
                        user.telegram_id
                    ),

                    [
                        "❤️ Спасибо, что были у нас!",
                        "",
                        `📍 ${location.name}`,
                        "",
                        "Будем благодарны, если поделитесь впечатлением о посещении в Яндексе.",
                        "",
                        "Ваш отзыв помогает нам становиться лучше и помогает другим гостям узнать о нас.",
                    ].join("\n"),

                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text:
                                            "⭐ Оставить отзыв в Яндексе",

                                        url:
                                        reviewUrl,
                                    },
                                ],
                            ],
                        },
                    }
                );


            await request.update({
                status:
                    "sent",

                sent_at:
                    new Date(),

                attempts:
                    Number(
                        request.attempts ||
                        0
                    ) + 1,

                last_error:
                    null,
            });


            console.log(
                `[ReviewRequest] ✅ user=${user.id} location=${location.code}`
            );

        } catch (error) {

            await request.update({
                status:
                    "failed",

                attempts:
                    Number(
                        request.attempts ||
                        0
                    ) + 1,

                last_error:
                    String(
                        error.message ||
                        error
                    ).slice(
                        0,
                        5000
                    ),
            });


            console.error(
                `[ReviewRequest] ❌ id=${request.id}:`,
                error.message
            );
        }
    }
}


function startReviewRequestWorker(
    bot
) {
    /*
     * Первый запуск вскоре
     * после старта сервера.
     */
    setTimeout(
        () => {
            runReviewRequests(
                bot
            ).catch(
                console.error
            );
        },

        15 * 1000
    );


    /*
     * Далее раз в 5 минут.
     */
    const timer =
        setInterval(
            () => {
                runReviewRequests(
                    bot
                ).catch(
                    console.error
                );
            },

            5 * 60 * 1000
        );


    timer.unref?.();


    console.log(
        "✅ Review request worker запущен"
    );
}


module.exports = {
    scheduleReviewRequest,
    runReviewRequests,
    startReviewRequestWorker,
};