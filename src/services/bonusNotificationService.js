const {
    Op,
} = require("sequelize");

const {
    BonusLot,
    Wallet,
    User,
    BonusExpiryNotification,
} = require("../models");

const {
    formatKopecks,
} = require("./walletService");


const MOSCOW_OFFSET_MS =
    3 * 60 * 60 * 1000;


/*
 * Возвращает сутки по Москве,
 * но границы переводит в UTC
 * для запроса в БД.
 */
function getMoscowDayRange(
    daysAhead
) {
    const now =
        new Date();

    const moscowNow =
        new Date(
            now.getTime() +
            MOSCOW_OFFSET_MS
        );


    const year =
        moscowNow
            .getUTCFullYear();

    const month =
        moscowNow
            .getUTCMonth();

    const day =
        moscowNow
            .getUTCDate();


    const localStartMs =
        Date.UTC(
            year,
            month,
            day + daysAhead,
            0,
            0,
            0,
            0
        );


    const utcStartMs =
        localStartMs -
        MOSCOW_OFFSET_MS;


    const utcEndMs =
        utcStartMs +
        24 * 60 * 60 * 1000;


    const targetMoscowDate =
        new Date(
            localStartMs
        );


    const expiresOn = [
        targetMoscowDate
            .getUTCFullYear(),

        String(
            targetMoscowDate
                .getUTCMonth() +
            1
        ).padStart(
            2,
            "0"
        ),

        String(
            targetMoscowDate
                .getUTCDate()
        ).padStart(
            2,
            "0"
        ),
    ].join("-");


    return {
        start:
            new Date(
                utcStartMs
            ),

        end:
            new Date(
                utcEndMs
            ),

        expiresOn,
    };
}


function formatDateOnly(
    value
) {
    const [
        year,
        month,
        day,
    ] =
        String(value)
            .split("-");


    return (
        `${day}.${month}.${year}`
    );
}


async function processNotificationType({
                                           bot,
                                           daysAhead,
                                           notificationType,
                                       }) {
    const {
        start,
        end,
        expiresOn,
    } =
        getMoscowDayRange(
            daysAhead
        );


    const lots =
        await BonusLot.findAll({
            where: {
                status:
                    "active",

                remaining_amount_kopecks: {
                    [Op.gt]:
                        0,
                },

                expires_at: {
                    [Op.gte]:
                    start,

                    [Op.lt]:
                    end,
                },
            },

            include: [
                {
                    model:
                    Wallet,

                    as:
                        "wallet",

                    required:
                        true,

                    include: [
                        {
                            model:
                            User,

                            as:
                                "user",

                            required:
                                true,

                            where: {
                                status:
                                    "active",
                            },
                        },
                    ],
                },
            ],
        });


    /*
     * Если несколько bonus_lots
     * клиента сгорают в один день,
     * отправляем одно сообщение.
     */
    const grouped =
        new Map();


    for (
        const lot
        of lots
        ) {
        const wallet =
            lot.wallet;

        const user =
            wallet?.user;


        if (
            !wallet ||
            !user
        ) {
            continue;
        }


        const walletId =
            Number(
                wallet.id
            );


        if (
            !grouped.has(
                walletId
            )
        ) {
            grouped.set(
                walletId,
                {
                    wallet,
                    user,
                    amountKopecks:
                        0,
                }
            );
        }


        const item =
            grouped.get(
                walletId
            );


        item.amountKopecks +=
            Number(
                lot
                    .remaining_amount_kopecks ||
                0
            );
    }


    for (
        const item
        of grouped.values()
        ) {
        const {
            wallet,
            user,
            amountKopecks,
        } = item;


        if (
            amountKopecks <= 0
        ) {
            continue;
        }


        const [
            notification,
        ] =
            await BonusExpiryNotification
                .findOrCreate({
                    where: {
                        wallet_id:
                        wallet.id,

                        notification_type:
                        notificationType,

                        expires_on:
                        expiresOn,
                    },

                    defaults: {
                        amount_kopecks:
                        amountKopecks,

                        status:
                            "pending",

                        attempts:
                            0,
                    },
                });


        /*
         * Уже успешно отправляли.
         */
        if (
            notification.status ===
            "sent"
        ) {
            continue;
        }


        /*
         * Не пытаемся бесконечно,
         * если Telegram стабильно
         * не принимает сообщение.
         */
        if (
            Number(
                notification.attempts ||
                0
            ) >= 5
        ) {
            continue;
        }


        await notification.update({
            amount_kopecks:
            amountKopecks,
        });


        try {
            const dateText =
                formatDateOnly(
                    expiresOn
                );


            const timingText =
                daysAhead === 1
                    ? "завтра"
                    : "через 3 дня";


            await bot.telegram
                .sendMessage(
                    String(
                        user.telegram_id
                    ),

                    [
                        "🎁 Бонусы Camp Card скоро сгорят",
                        "",
                        `${dateText} (${timingText}) сгорит ${formatKopecks(amountKopecks)} ₽ бонусов.`,
                        "",
                        `Сейчас бонусов на балансе: ${formatKopecks(wallet.bonus_balance_kopecks)} ₽`,
                        "",
                        "Успейте использовать бонусы при оплате в наших заведениях.",
                    ].join("\n"),

                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text:
                                            "📱 Показать QR",

                                        callback_data:
                                            "card_show_qr",
                                    },
                                ],
                                [
                                    {
                                        text:
                                            "📜 История",

                                        callback_data:
                                            "card_history",
                                    },
                                ],
                            ],
                        },
                    }
                );


            await notification.update({
                status:
                    "sent",

                attempts:
                    Number(
                        notification.attempts ||
                        0
                    ) + 1,

                last_error:
                    null,

                sent_at:
                    new Date(),
            });


            console.log(
                `[BonusNotify] ✅ wallet=${wallet.id} type=${notificationType} amount=${amountKopecks}`
            );

        } catch (error) {

            await notification.update({
                status:
                    "failed",

                attempts:
                    Number(
                        notification.attempts ||
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
                `[BonusNotify] ❌ wallet=${wallet.id}:`,
                error.message
            );
        }
    }
}


async function runBonusExpiryNotifications(
    bot
) {
    await processNotificationType({
        bot,
        daysAhead: 3,
        notificationType:
            "3d",
    });


    await processNotificationType({
        bot,
        daysAhead: 1,
        notificationType:
            "1d",
    });
}


function startBonusExpiryNotificationWorker(
    bot
) {
    /*
     * Первая проверка
     * вскоре после запуска.
     */
    setTimeout(
        () => {
            runBonusExpiryNotifications(
                bot
            ).catch(
                console.error
            );
        },

        10 * 1000
    );


    /*
     * Затем раз в час.
     */
    const timer =
        setInterval(
            () => {
                runBonusExpiryNotifications(
                    bot
                ).catch(
                    console.error
                );
            },

            60 * 60 * 1000
        );


    timer.unref?.();


    console.log(
        "✅ Bonus expiry worker запущен"
    );
}


module.exports = {
    runBonusExpiryNotifications,
    startBonusExpiryNotificationWorker,
};