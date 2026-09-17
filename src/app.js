require("dotenv").config();

const express = require("express");

const sequelize = require(
    "./config/database"
);

require("./models");

const bot = require(
    "./bot/bot"
);

const {
    startBusinessCashRetryWorker,
} = require(
    "./integrations/businessCash/businessCashService"
);

const {
    seedDefaultPlans,
} = require("./services/planService");

const {
    seedLocations,
} = require("./services/locationService");

const {
    finalizeSberTopup,
} = require(
    "./services/sberTopupService"
);

const {
    startReviewRequestWorker,
} = require(
    "./services/reviewRequestService"
);

const {
    formatKopecks,
} = require(
    "./services/walletService"
);

const {
    startBonusExpiryNotificationWorker,
} = require(
    "./services/bonusNotificationService"
);

const app = express();

const PORT = Number(
    process.env.PORT || 5002
);

const WEBHOOK_PATH =
    process.env.TELEGRAM_WEBHOOK_PATH ||
    "/campcard-webhook";

const WEBHOOK_DOMAIN =
    process.env.TELEGRAM_WEBHOOK_DOMAIN ||
    "notify.cargocamp.ru";

const WEBHOOK_SECRET =
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    "campcardwebhook";


app.use(
    express.json()
);


/*
 * Telegram webhook.
 */
app.post(
    WEBHOOK_PATH,
    async (req, res) => {
        try {
            const receivedSecret =
                req.get(
                    "x-telegram-bot-api-secret-token"
                );

            if (
                WEBHOOK_SECRET &&
                receivedSecret !==
                WEBHOOK_SECRET
            ) {
                return res
                    .status(401)
                    .send("Unauthorized");
            }

            await bot.handleUpdate(
                req.body
            );

            return res.sendStatus(200);

        } catch (error) {
            console.error(
                "❌ Ошибка Telegram webhook:",
                error
            );

            return res.sendStatus(500);
        }
    }
);


app.get(
    "/health",
    (req, res) => {
        res.json({
            ok: true,
            service: "camp-card",
            telegram: "webhook",
            timestamp:
                new Date().toISOString(),
        });
    }
);

app.post(
    "/campcard-sber/callback",
    async (req, res) => {
        try {
            const {
                mdOrder,
                orderNumber,
                operation,
                status,
            } =
            req.body || {};


            console.log(
                "[Sber callback]",
                {
                    mdOrder,
                    orderNumber,
                    operation,
                    status,
                }
            );


            /*
             * Нас интересует только
             * успешное завершение оплаты.
             */
            if (
                operation !==
                "deposited" ||
                Number(status) !== 1
            ) {
                return res
                    .sendStatus(200);
            }


            const result =
                await finalizeSberTopup({
                    sberOrderId:
                    mdOrder,

                    orderNumber,
                });


            if (
                result.completed &&
                result.customer &&
                !result.alreadyCredited
            ) {
                try {
                    const paid =
                        Number(
                            result.payment
                                .paid_amount_kopecks
                        );

                    const bonus =
                        Number(
                            result.payment
                                .bonus_amount_kopecks
                        );

                    const paidBalance =
                        Number(
                            result.wallet
                                .paid_balance_kopecks || 0
                        );

                    const bonusBalance =
                        Number(
                            result.wallet
                                .bonus_balance_kopecks || 0
                        );

                    const totalBalance =
                        paidBalance +
                        bonusBalance;


                    await bot.telegram.sendMessage(
                        String(
                            result.customer.telegram_id
                        ),

                        [
                            "✅ Camp Card пополнена",
                            "",
                            `Оплачено: ${formatKopecks(paid)} ₽`,
                            `Бонус: +${formatKopecks(bonus)} ₽`,
                            `Зачислено: ${formatKopecks(paid + bonus)} ₽`,
                            "",
                            `Основной баланс: ${formatKopecks(paidBalance)} ₽`,
                            `Бонусы: ${formatKopecks(bonusBalance)} ₽`,
                            `Доступно: ${formatKopecks(totalBalance)} ₽`,
                        ].join("\n"),

                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text:
                                                "💳 Моя Camp Card",
                                            callback_data:
                                                "card_back",
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

                } catch (
                    notifyError
                    ) {
                    console.error(
                        "Sber notify:",
                        notifyError
                    );
                }
            }


            return res
                .sendStatus(200);

        } catch (error) {

            console.error(
                "Sber callback error:",
                error
            );


            /*
             * Сбер повторяет callback,
             * если мы не ответили 200.
             */
            return res
                .sendStatus(500);
        }
    }
);

app.get(
    "/campcard-sber/return",
    (req, res) => {

        const username =
            String(
                process.env
                    .TELEGRAM_BOT_USERNAME ||
                ""
            ).replace(
                "@",
                ""
            );


        return res.redirect(
            `https://t.me/${username}`
        );
    }
);


app.get(
    "/campcard-sber/fail",
    (req, res) => {

        const username =
            String(
                process.env
                    .TELEGRAM_BOT_USERNAME ||
                ""
            ).replace(
                "@",
                ""
            );


        return res.redirect(
            `https://t.me/${username}`
        );
    }
);

async function start() {
    try {
        await sequelize.authenticate();

        console.log(
            "✅ MySQL подключён"
        );

        await sequelize.sync({
            alter: false,
        });

        await seedDefaultPlans();
        await seedLocations();

        console.log(
            "✅ Точки Camp Card загружены"
        );

        console.log(
            "✅ Пакеты Camp Card загружены"
        );

        console.log(
            "✅ Таблицы Camp Card синхронизированы"
        );

        startBusinessCashRetryWorker();

        /*
         * Сначала поднимаем локальный HTTP.
         */
        await new Promise(
            (resolve) => {
                app.listen(
                    PORT,
                    "0.0.0.0",
                    () => {
                        console.log(
                            `✅ Camp Card API: 0.0.0.0:${PORT}`
                        );

                        resolve();
                    }
                );
            }
        );

        /*
         * Затем регистрируем webhook
         * через наш Telegram API gateway.
         */
        const webhookUrl =
            `https://${WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;

        await bot.telegram.setWebhook(
            webhookUrl,
            {
                secret_token:
                WEBHOOK_SECRET,
            }
        );

        startBonusExpiryNotificationWorker(
            bot
        );

        startReviewRequestWorker(
            bot
        );

        console.log(
            "✅ Telegram Camp Card запущен в WEBHOOK режиме"
        );

        console.log(
            `🌐 Webhook: ${webhookUrl}`
        );

    } catch (error) {
        console.error(
            "❌ Ошибка запуска Camp Card:",
            error
        );

        process.exit(1);
    }
}


start();


process.once(
    "SIGINT",
    async () => {
        await sequelize.close();
        process.exit(0);
    }
);

process.once(
    "SIGTERM",
    async () => {
        await sequelize.close();
        process.exit(0);
    }
);