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

const app = express();

const PORT = Number(
    process.env.PORT || 5002
);

const {
    seedDefaultPlans,
} = require("./services/planService");

const {
    seedLocations,
} = require("./services/locationService");

app.use(
    express.json()
);

app.get(
    "/health",
    (req, res) => {
        res.json({
            ok: true,

            service:
                "camp-card",

            telegram:
                "running",

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

        await bot.launch();

        console.log(
            "✅ Telegram Camp Card запущен"
        );

        app.listen(
            PORT,
            () => {
                console.log(
                    `✅ Camp Card API запущен на порту ${PORT}`
                );
            }
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
        bot.stop("SIGINT");

        await sequelize.close();

        process.exit(0);
    }
);

process.once(
    "SIGTERM",
    async () => {
        bot.stop("SIGTERM");

        await sequelize.close();

        process.exit(0);
    }
);