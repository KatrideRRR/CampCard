const {
    Op,
} = require("sequelize");

const {
    WalletTransaction,
    TopupPayment,
    Location,
} = require("../models");

const {
    formatKopecks,
} = require("./walletService");


function formatDate(value) {
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

            hour:
                "2-digit",

            minute:
                "2-digit",
        }
    ).format(
        new Date(value)
    );
}


function normalizeMetadata(value) {
    if (!value) {
        return {};
    }

    if (
        typeof value ===
        "object"
    ) {
        return value;
    }

    try {
        return JSON.parse(
            value
        );
    } catch (_) {
        return {};
    }
}


function getBaseExternalRef(
    externalRef
) {
    if (!externalRef) {
        return null;
    }

    return String(
        externalRef
    )
        .replace(
            /:paid$/,
            ""
        )
        .replace(
            /:bonus$/,
            ""
        );
}


async function getWalletHistory({
                                    walletId,
                                    beforeId = null,
                                    limit = 8,
                                }) {
    const where = {
        wallet_id:
        walletId,
    };


    if (beforeId) {
        where.id = {
            [Op.lt]:
                Number(
                    beforeId
                ),
        };
    }


    const rows =
        await WalletTransaction.findAll({
            where,

            order: [
                [
                    "id",
                    "DESC",
                ],
            ],

            limit:
                limit + 1,
        });


    const hasMore =
        rows.length >
        limit;


    const transactions =
        hasMore
            ? rows.slice(
                0,
                limit
            )
            : rows;


    /*
     * Находим связанные
     * наличные пополнения.
     */
    const baseRefs =
        [
            ...new Set(
                transactions
                    .map(
                        (row) =>
                            getBaseExternalRef(
                                row.external_ref
                            )
                    )
                    .filter(
                        Boolean
                    )
            ),
        ];


    const topups =
        baseRefs.length
            ? await TopupPayment.findAll({
                where: {
                    external_ref: {
                        [Op.in]:
                        baseRefs,
                    },
                },

                include: [
                    {
                        model:
                        Location,

                        as:
                            "location",

                        required:
                            false,
                    },
                ],
            })
            : [];


    const topupMap =
        new Map(
            topups.map(
                (topup) => [
                    String(
                        topup.external_ref
                    ),

                    topup,
                ]
            )
        );


    const items =
        transactions.map(
            (row) => {

                const paidDelta =
                    Number(
                        row
                            .paid_delta_kopecks ||
                        0
                    );

                const bonusDelta =
                    Number(
                        row
                            .bonus_delta_kopecks ||
                        0
                    );

                const totalDelta =
                    paidDelta +
                    bonusDelta;


                const balanceAfter =
                    Number(
                        row
                            .paid_balance_after_kopecks ||
                        0
                    ) +
                    Number(
                        row
                            .bonus_balance_after_kopecks ||
                        0
                    );


                const metadata =
                    normalizeMetadata(
                        row.metadata
                    );


                const baseRef =
                    getBaseExternalRef(
                        row.external_ref
                    );


                const topup =
                    baseRef
                        ? topupMap.get(
                            baseRef
                        )
                        : null;


                let icon =
                    "💳";

                let title =
                    row.description ||
                    "Операция Camp Card";


                switch (
                    row.type
                    ) {

                    case "topup":
                        icon =
                            "💵";

                        title =
                            topup?.location
                                ?.name
                                ? `Пополнение — ${topup.location.name}`
                                : "Пополнение Camp Card";

                        break;


                    case "bonus":
                        icon =
                            "🎁";

                        title =
                            row.description ||
                            "Бонус Camp Card";

                        break;


                    case "purchase":
                        icon =
                            "🛍";

                        title =
                            metadata
                                .locationName ||
                            metadata
                                .locationCode ||
                            row.description ||
                            "Покупка";

                        /*
                         * Сейчас description уже:
                         * "Оплата Camp Card — Адалет"
                         */
                        if (
                            row.description
                        ) {
                            title =
                                row.description
                                    .replace(
                                        "Оплата Camp Card — ",
                                        ""
                                    );
                        }

                        break;


                    case "refund":
                        icon =
                            "↩️";

                        title =
                            "Возврат";

                        break;


                    case "bonus_expired":
                        icon =
                            "⌛";

                        title =
                            "Сгорели бонусы";

                        break;


                    case "adjustment":
                        icon =
                            "⚙️";

                        title =
                            row.description ||
                            "Корректировка";

                        break;
                }


                return {
                    id:
                    row.id,

                    type:
                    row.type,

                    icon,

                    title,

                    date:
                        formatDate(
                            row.createdAt ||
                            row.created_at
                        ),

                    paidDelta,

                    bonusDelta,

                    totalDelta,

                    paidBalanceAfter:
                        Number(
                            row
                                .paid_balance_after_kopecks ||
                            0
                        ),

                    bonusBalanceAfter:
                        Number(
                            row
                                .bonus_balance_after_kopecks ||
                            0
                        ),

                    balanceAfter,
                };
            }
        );


    return {
        items,
        hasMore,

        nextBeforeId:
            items.length
                ? items[
                items.length - 1
                    ].id
                : null,
    };
}


function signedAmount(
    amount
) {
    const value =
        Number(
            amount ||
            0
        );

    if (value > 0) {
        return (
            "+" +
            formatKopecks(
                value
            ) +
            " ₽"
        );
    }

    if (value < 0) {
        return (
            "−" +
            formatKopecks(
                Math.abs(
                    value
                )
            ) +
            " ₽"
        );
    }

    return "0 ₽";
}


function buildHistoryText(
    items
) {
    if (!items.length) {
        return [
            "📜 История Camp Card",
            "",
            "Операций пока нет.",
        ].join("\n");
    }


    const blocks =
        items.map(
            (item) => {

                const lines = [
                    item.date,

                    `${item.icon} ${item.title}`,

                    signedAmount(
                        item.totalDelta
                    ),
                ];


                /*
                 * Для покупки показываем,
                 * сколько реально и бонусами.
                 */
                if (
                    item.type ===
                    "purchase"
                ) {
                    if (
                        item.paidDelta !==
                        0
                    ) {
                        lines.push(
                            `Основные: ${signedAmount(item.paidDelta)}`
                        );
                    }

                    if (
                        item.bonusDelta !==
                        0
                    ) {
                        lines.push(
                            `Бонусы: ${signedAmount(item.bonusDelta)}`
                        );
                    }
                }


                lines.push(
                    `Баланс: ${formatKopecks(item.balanceAfter)} ₽`
                );


                return lines.join(
                    "\n"
                );
            }
        );


    return [
        "📜 История Camp Card",
        "",
        blocks.join(
            "\n\n"
        ),
    ].join("\n");
}


module.exports = {
    getWalletHistory,
    buildHistoryText,
};