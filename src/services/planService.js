const { Plan } = require("../models");

const DEFAULT_PLANS = [
    {
        code: "camp_week",
        name: "Camp Week",
        topup_amount_kopecks: 300000,   // 3 000 ₽
        bonus_amount_kopecks: 15000,    // 150 ₽
        bonus_valid_days: 7,
        sort_order: 10,
    },
    {
        code: "camp_standard",
        name: "Camp Standard",
        topup_amount_kopecks: 600000,   // 6 000 ₽
        bonus_amount_kopecks: 48000,    // 480 ₽
        bonus_valid_days: 30,
        sort_order: 20,
    },
    {
        code: "camp_month",
        name: "Camp Month",
        topup_amount_kopecks: 1000000,  // 10 000 ₽
        bonus_amount_kopecks: 100000,   // 1 000 ₽
        bonus_valid_days: 30,
        sort_order: 30,
    },
];

async function seedDefaultPlans() {
    for (const data of DEFAULT_PLANS) {
        await Plan.findOrCreate({
            where: {
                code: data.code,
            },
            defaults: data,
        });
    }
}

async function getActivePlans() {
    return Plan.findAll({
        where: {
            is_active: true,
        },
        order: [
            ["sort_order", "ASC"],
            ["id", "ASC"],
        ],
    });
}

async function getPlanByCode(code) {
    return Plan.findOne({
        where: {
            code,
            is_active: true,
        },
    });
}

module.exports = {
    seedDefaultPlans,
    getActivePlans,
    getPlanByCode,
};