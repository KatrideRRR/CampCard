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
                    "127.0.0.1",
                    () => {
                        console.log(
                            `✅ Camp Card API: 127.0.0.1:${PORT}`
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