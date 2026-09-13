const { Op } = require("sequelize");

const sequelize = require("../config/database");

const {
    User,
    Wallet,
    WalletTransaction,
    BonusLot,
} = require("../models");

function toNumber(value) {
    return Number(value || 0);
}

function formatKopecks(value) {
    const kopecks = toNumber(value);

    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(kopecks / 100);
}

async function getOrCreateTelegramUser(telegramUser) {
    return sequelize.transaction(async (transaction) => {

        let user = await User.findOne({
            where: {
                telegram_id: telegramUser.id,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!user) {
            user = await User.create(
                {
                    telegram_id: telegramUser.id,
                    username: telegramUser.username || null,
                    first_name: telegramUser.first_name || null,
                    last_name: telegramUser.last_name || null,
                    role: "customer",
                    status: "active",
                },
                {
                    transaction,
                }
            );
        } else {
            await user.update(
                {
                    username: telegramUser.username || null,
                    first_name: telegramUser.first_name || null,
                    last_name: telegramUser.last_name || null,
                },
                {
                    transaction,
                }
            );
        }

        let wallet = await Wallet.findOne({
            where: {
                user_id: user.id,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!wallet) {
            wallet = await Wallet.create(
                {
                    user_id: user.id,
                    paid_balance_kopecks: 0,
                    bonus_balance_kopecks: 0,
                    status: "active",
                },
                {
                    transaction,
                }
            );
        }

        return {
            user,
            wallet,
        };
    });
}

async function expireBonuses(wallet, transaction) {
    const now = new Date();

    const expiredLots = await BonusLot.findAll({
        where: {
            wallet_id: wallet.id,

            status: "active",

            remaining_amount_kopecks: {
                [Op.gt]: 0,
            },

            expires_at: {
                [Op.lte]: now,
            },
        },

        order: [
            ["expires_at", "ASC"],
            ["id", "ASC"],
        ],

        transaction,

        lock: transaction.LOCK.UPDATE,
    });

    let expiredTotal = 0;

    for (const lot of expiredLots) {
        const remaining =
            toNumber(
                lot.remaining_amount_kopecks
            );

        if (remaining <= 0) {
            continue;
        }

        expiredTotal += remaining;

        await lot.update(
            {
                remaining_amount_kopecks: 0,
                status: "expired",
            },
            {
                transaction,
            }
        );
    }

    if (expiredTotal > 0) {
        const currentBonus =
            toNumber(
                wallet.bonus_balance_kopecks
            );

        const newBonus =
            Math.max(
                0,
                currentBonus - expiredTotal
            );

        await wallet.update(
            {
                bonus_balance_kopecks:
                newBonus,
            },
            {
                transaction,
            }
        );

        await WalletTransaction.create(
            {
                wallet_id: wallet.id,

                type: "bonus_expired",

                paid_delta_kopecks: 0,

                bonus_delta_kopecks:
                    -expiredTotal,

                paid_balance_after_kopecks:
                    toNumber(
                        wallet.paid_balance_kopecks
                    ),

                bonus_balance_after_kopecks:
                newBonus,

                description:
                    "Истечение срока действия бонусов",
            },
            {
                transaction,
            }
        );
    }

    return expiredTotal;
}

async function getWalletForUser(userId) {
    return sequelize.transaction(
        async (transaction) => {

            const wallet =
                await Wallet.findOne({
                    where: {
                        user_id: userId,
                    },

                    transaction,

                    lock:
                    transaction.LOCK.UPDATE,
                });

            if (!wallet) {
                return null;
            }

            await expireBonuses(
                wallet,
                transaction
            );

            await wallet.reload({
                transaction,
            });

            return wallet;
        }
    );
}

async function creditPlan({
                              walletId,
                              plan,
                              externalRef = null,
                              description = null,
                          }) {
    return sequelize.transaction(
        async (transaction) => {

            const wallet =
                await Wallet.findByPk(
                    walletId,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (!wallet) {
                throw new Error(
                    "WALLET_NOT_FOUND"
                );
            }

            if (
                wallet.status !== "active"
            ) {
                throw new Error(
                    "WALLET_BLOCKED"
                );
            }

            await expireBonuses(
                wallet,
                transaction
            );

            await wallet.reload({
                transaction,
            });

            const paidAmount =
                toNumber(
                    plan.topup_amount_kopecks
                );

            const bonusAmount =
                toNumber(
                    plan.bonus_amount_kopecks
                );

            const oldPaid =
                toNumber(
                    wallet.paid_balance_kopecks
                );

            const oldBonus =
                toNumber(
                    wallet.bonus_balance_kopecks
                );

            /*
             * 1. Деньги клиента
             */

            const newPaid =
                oldPaid + paidAmount;

            await wallet.update(
                {
                    paid_balance_kopecks:
                    newPaid,
                },
                {
                    transaction,
                }
            );

            await WalletTransaction.create(
                {
                    wallet_id: wallet.id,

                    type: "topup",

                    paid_delta_kopecks:
                    paidAmount,

                    bonus_delta_kopecks: 0,

                    paid_balance_after_kopecks:
                    newPaid,

                    bonus_balance_after_kopecks:
                    oldBonus,

                    external_ref:
                        externalRef
                            ? `${externalRef}:paid`
                            : null,

                    description:
                        description ||
                        `Пополнение ${plan.name}`,

                    metadata: {
                        planId: plan.id,
                        planCode: plan.code,
                    },
                },
                {
                    transaction,
                }
            );

            /*
             * 2. Бонус Camp Card
             */

            let bonusTransaction = null;

            let newBonus = oldBonus;

            if (bonusAmount > 0) {
                newBonus =
                    oldBonus + bonusAmount;

                await wallet.update(
                    {
                        bonus_balance_kopecks:
                        newBonus,
                    },
                    {
                        transaction,
                    }
                );

                bonusTransaction =
                    await WalletTransaction.create(
                        {
                            wallet_id:
                            wallet.id,

                            type: "bonus",

                            paid_delta_kopecks:
                                0,

                            bonus_delta_kopecks:
                            bonusAmount,

                            paid_balance_after_kopecks:
                            newPaid,

                            bonus_balance_after_kopecks:
                            newBonus,

                            external_ref:
                                externalRef
                                    ? `${externalRef}:bonus`
                                    : null,

                            description:
                                `Бонус по пакету ${plan.name}`,

                            metadata: {
                                planId:
                                plan.id,

                                planCode:
                                plan.code,
                            },
                        },
                        {
                            transaction,
                        }
                    );

                const validDays =
                    Number(
                        plan.bonus_valid_days ||
                        30
                    );

                const expiresAt =
                    new Date();

                expiresAt.setDate(
                    expiresAt.getDate() +
                    validDays
                );

                await BonusLot.create(
                    {
                        wallet_id:
                        wallet.id,

                        source_transaction_id:
                        bonusTransaction.id,

                        original_amount_kopecks:
                        bonusAmount,

                        remaining_amount_kopecks:
                        bonusAmount,

                        expires_at:
                        expiresAt,

                        status:
                            "active",
                    },
                    {
                        transaction,
                    }
                );
            }

            await wallet.reload({
                transaction,
            });

            return {
                wallet,
                paidAmount,
                bonusAmount,
                totalCredited:
                    paidAmount +
                    bonusAmount,
            };
        }
    );
}

async function consumeBonusLots({
                                    walletId,
                                    amountKopecks,
                                    transaction,
                                }) {
    let remaining =
        Number(amountKopecks);

    if (remaining <= 0) {
        return;
    }

    const lots =
        await BonusLot.findAll({
            where: {
                wallet_id: walletId,

                status: "active",

                remaining_amount_kopecks: {
                    [Op.gt]: 0,
                },
            },

            order: [
                ["expires_at", "ASC"],
                ["id", "ASC"],
            ],

            transaction,

            lock:
            transaction.LOCK.UPDATE,
        });

    for (const lot of lots) {
        if (remaining <= 0) {
            break;
        }

        const available =
            toNumber(
                lot.remaining_amount_kopecks
            );

        const take =
            Math.min(
                available,
                remaining
            );

        const newRemaining =
            available - take;

        await lot.update(
            {
                remaining_amount_kopecks:
                newRemaining,

                status:
                    newRemaining === 0
                        ? "used"
                        : "active",
            },
            {
                transaction,
            }
        );

        remaining -= take;
    }

    if (remaining > 0) {
        throw new Error(
            "BONUS_LOT_MISMATCH"
        );
    }
}

async function spendInsideTransaction({
                                          walletId,
                                          amountKopecks,
                                          description = null,
                                          externalRef = null,
                                          metadata = null,
                                          transaction,
                                      }) {
    amountKopecks =
        Number(amountKopecks);

    if (
        !Number.isInteger(amountKopecks) ||
        amountKopecks <= 0
    ) {
        throw new Error(
            "INVALID_AMOUNT"
        );
    }

    const wallet =
        await Wallet.findByPk(
            walletId,
            {
                transaction,
                lock:
                transaction.LOCK.UPDATE,
            }
        );

    if (!wallet) {
        throw new Error(
            "WALLET_NOT_FOUND"
        );
    }

    if (wallet.status !== "active") {
        throw new Error(
            "WALLET_BLOCKED"
        );
    }

    await expireBonuses(
        wallet,
        transaction
    );

    await wallet.reload({
        transaction,
    });

    const paid =
        toNumber(
            wallet.paid_balance_kopecks
        );

    const bonus =
        toNumber(
            wallet.bonus_balance_kopecks
        );

    const total =
        paid + bonus;

    if (total < amountKopecks) {
        throw new Error(
            "INSUFFICIENT_FUNDS"
        );
    }

    let bonusToSpend =
        Math.round(
            amountKopecks *
            bonus /
            total
        );

    bonusToSpend =
        Math.min(
            bonusToSpend,
            bonus,
            amountKopecks
        );

    let paidToSpend =
        amountKopecks -
        bonusToSpend;

    if (paidToSpend > paid) {
        const shortage =
            paidToSpend - paid;

        paidToSpend = paid;

        bonusToSpend += shortage;
    }

    if (bonusToSpend > bonus) {
        const shortage =
            bonusToSpend - bonus;

        bonusToSpend = bonus;

        paidToSpend += shortage;
    }

    const newPaid =
        paid -
        paidToSpend;

    const newBonus =
        bonus -
        bonusToSpend;

    if (bonusToSpend > 0) {
        await consumeBonusLots({
            walletId:
            wallet.id,

            amountKopecks:
            bonusToSpend,

            transaction,
        });
    }

    await wallet.update(
        {
            paid_balance_kopecks:
            newPaid,

            bonus_balance_kopecks:
            newBonus,
        },
        {
            transaction,
        }
    );

    const walletTransaction =
        await WalletTransaction.create(
            {
                wallet_id:
                wallet.id,

                type:
                    "purchase",

                paid_delta_kopecks:
                    -paidToSpend,

                bonus_delta_kopecks:
                    -bonusToSpend,

                paid_balance_after_kopecks:
                newPaid,

                bonus_balance_after_kopecks:
                newBonus,

                external_ref:
                externalRef,

                description,

                metadata,
            },
            {
                transaction,
            }
        );

    return {
        transaction:
        walletTransaction,

        amountKopecks,

        paidSpentKopecks:
        paidToSpend,

        bonusSpentKopecks:
        bonusToSpend,

        paidBalanceKopecks:
        newPaid,

        bonusBalanceKopecks:
        newBonus,

        totalBalanceKopecks:
            newPaid +
            newBonus,
    };
}

async function spend(data) {
    return sequelize.transaction(
        async (transaction) => {
            return spendInsideTransaction({
                ...data,
                transaction,
            });
        }
    );
}

function buildWalletText(wallet) {
    const paid =
        toNumber(
            wallet.paid_balance_kopecks
        );

    const bonus =
        toNumber(
            wallet.bonus_balance_kopecks
        );

    const total =
        paid + bonus;

    return [
        "💳 Camp Card",
        "",
        `Баланс: ${formatKopecks(total)} ₽`,
        "",
        `Ваши средства: ${formatKopecks(paid)} ₽`,
        `Бонусы: ${formatKopecks(bonus)} ₽`,
    ].join("\n");
}

module.exports = {
    formatKopecks,
    getOrCreateTelegramUser,
    getWalletForUser,
    creditPlan,
    spend,
    spendInsideTransaction,
    buildWalletText,
};