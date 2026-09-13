const {
    Op,
} = require("sequelize");

const {
    BonusLot,
} = require("../models");

const {
    getWalletForUser,
    formatKopecks,
} = require("./walletService");


function formatBonusDate(
    value
) {
    return new Intl.DateTimeFormat(
        "ru-RU",
        {
            timeZone:
                "Europe/Moscow",

            day:
                "2-digit",

            month:
                "2-digit",

            year:
                "numeric",
        }
    ).format(
        new Date(value)
    );
}


async function getCardOverview(
    userId
) {
    /*
     * getWalletForUser одновременно
     * проверит и спишет уже
     * истёкшие бонусы.
     */
    const wallet =
        await getWalletForUser(
            userId
        );


    if (!wallet) {
        throw new Error(
            "WALLET_NOT_FOUND"
        );
    }


    const bonusLots =
        await BonusLot.findAll({
            where: {
                wallet_id:
                wallet.id,

                status:
                    "active",

                remaining_amount_kopecks: {
                    [Op.gt]:
                        0,
                },

                expires_at: {
                    [Op.gt]:
                        new Date(),
                },
            },

            order: [
                [
                    "expires_at",
                    "ASC",
                ],
                [
                    "id",
                    "ASC",
                ],
            ],
        });


    const paid =
        Number(
            wallet
                .paid_balance_kopecks ||
            0
        );

    const bonus =
        Number(
            wallet
                .bonus_balance_kopecks ||
            0
        );

    const total =
        paid +
        bonus;


    let nearestBonus = null;


    if (bonusLots.length) {
        const firstDate =
            formatBonusDate(
                bonusLots[0]
                    .expires_at
            );


        let amount = 0;


        for (
            const lot
            of bonusLots
            ) {
            if (
                formatBonusDate(
                    lot.expires_at
                ) !==
                firstDate
            ) {
                break;
            }


            amount +=
                Number(
                    lot
                        .remaining_amount_kopecks ||
                    0
                );
        }


        nearestBonus = {
            date:
            firstDate,

            amountKopecks:
            amount,
        };
    }


    return {
        wallet,
        paid,
        bonus,
        total,
        nearestBonus,
    };
}


function buildCardOverviewText(
    overview
) {
    const lines = [
        "💳 Моя Camp Card",
        "",
        `💰 Доступно: ${formatKopecks(overview.total)} ₽`,
        "",
        `Основные средства: ${formatKopecks(overview.paid)} ₽`,
        `Бонусы: ${formatKopecks(overview.bonus)} ₽`,
    ];


    if (
        overview.nearestBonus
    ) {
        lines.push(
            "",
            "🎁 Ближайшее сгорание бонусов:",
            `${formatKopecks(
                overview
                    .nearestBonus
                    .amountKopecks
            )} ₽ — ${overview.nearestBonus.date}`
        );

    } else {
        lines.push(
            "",
            "🎁 Активных бонусов нет."
        );
    }


    return lines.join(
        "\n"
    );
}


module.exports = {
    getCardOverview,
    buildCardOverviewText,
};