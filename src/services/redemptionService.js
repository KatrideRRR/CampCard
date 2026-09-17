const crypto = require("crypto");

const sequelize = require("../config/database");

const {
    User,
    Wallet,
    QrToken,
    PendingCharge,
    Redemption,
    Location,
} = require("../models");

const {
    getCurrentEmployeeLocation,
    employeeHasLocation,
} = require(
    "./employeeLocationService"
);

const {
    hashToken,
} = require("./qrService");

const {
    spendInsideTransaction,
} = require("./walletService");


function parseRublesToKopecks(value) {
    const normalized = String(value || "")
        .trim()
        .replace(/\s/g, "")
        .replace(",", ".");

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        return null;
    }

    const [
        rubles,
        kopecks = "",
    ] = normalized.split(".");

    const amount =
        Number(rubles) * 100 +
        Number(
            kopecks.padEnd(2, "0")
        );

    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        return null;
    }

    return amount;
}


async function getEmployeeLocation({
                                       userId,
                                       transaction = null,
                                   }) {
    return getCurrentEmployeeLocation({
        userId,
        transaction,
    });
}

async function claimPaymentQr({
                                  rawToken,
                                  employeeUserId,
                              }) {
    return sequelize.transaction(
        async (transaction) => {

            const employee =
                await User.findByPk(
                    employeeUserId,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (!employee) {
                throw new Error(
                    "EMPLOYEE_NOT_FOUND"
                );
            }

            if (
                ![
                    "employee",
                    "admin",
                    "owner",
                ].includes(employee.role)
            ) {
                throw new Error(
                    "NOT_EMPLOYEE"
                );
            }

            const employeeData =
                await getEmployeeLocation({
                    userId:
                    employee.id,

                    transaction,
                });

            if (!employeeData) {
                throw new Error(
                    "EMPLOYEE_LOCATION_NOT_SET"
                );
            }

            const location =
                employeeData.location;

            const tokenHash =
                hashToken(rawToken);

            const qrToken =
                await QrToken.findOne({
                    where: {
                        token_hash:
                        tokenHash,
                    },

                    transaction,

                    lock:
                    transaction.LOCK.UPDATE,
                });

            if (!qrToken) {
                throw new Error(
                    "QR_NOT_FOUND"
                );
            }

            if (
                qrToken.status !== "active"
            ) {
                throw new Error(
                    "QR_ALREADY_USED"
                );
            }

            const now =
                new Date();

            if (
                new Date(
                    qrToken.expires_at
                ) <= now
            ) {
                await qrToken.update(
                    {
                        status:
                            "expired",
                    },
                    {
                        transaction,
                    }
                );

                throw new Error(
                    "QR_EXPIRED"
                );
            }

            /*
             * У сотрудника одновременно
             * может быть только одно
             * активное списание.
             */

            await PendingCharge.update(
                {
                    status:
                        "cancelled",
                },
                {
                    where: {
                        employee_user_id:
                        employee.id,

                        status:
                            "active",
                    },

                    transaction,
                }
            );

            /*
             * После сканирования QR
             * закрепляется за сотрудником.
             */

            await qrToken.update(
                {
                    status:
                        "claimed",

                    claimed_by_user_id:
                    employee.id,

                    claimed_at:
                    now,
                },
                {
                    transaction,
                }
            );

            const pendingExpiresAt =
                new Date(
                    Date.now() +
                    3 * 60 * 1000
                );

            const pendingCharge =
                await PendingCharge.create(
                    {
                        employee_user_id:
                        employee.id,

                        qr_token_id:
                        qrToken.id,

                        location_id:
                            location
                            .id,

                        amount_kopecks:
                            null,

                        status:
                            "active",

                        expires_at:
                        pendingExpiresAt,
                    },
                    {
                        transaction,
                    }
                );

            const wallet =
                await Wallet.findByPk(
                    qrToken.wallet_id,
                    {
                        transaction,
                    }
                );

            if (!wallet) {
                throw new Error(
                    "WALLET_NOT_FOUND"
                );
            }

            const customer =
                await User.findByPk(
                    wallet.user_id,
                    {
                        transaction,
                    }
                );

            return {
                pendingCharge,

                location,

                wallet,

                customer,
            };
        }
    );
}


async function getActivePendingCharge(
    employeeUserId
) {
    const pending =
        await PendingCharge.findOne({
            where: {
                employee_user_id:
                employeeUserId,

                status:
                    "active",
            },

            order: [
                ["id", "DESC"],
            ],
        });

    if (!pending) {
        return null;
    }

    if (
        new Date(
            pending.expires_at
        ) <= new Date()
    ) {
        await pending.update({
            status:
                "cancelled",
        });

        return null;
    }

    return pending;
}


async function setPendingChargeAmount({
                                          pendingChargeId,
                                          employeeUserId,
                                          amountKopecks,
                                      }) {
    return sequelize.transaction(
        async (transaction) => {

            const pending =
                await PendingCharge.findByPk(
                    pendingChargeId,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (
                !pending ||
                pending.status !== "active"
            ) {
                throw new Error(
                    "PENDING_NOT_FOUND"
                );
            }

            if (
                Number(
                    pending.employee_user_id
                ) !==
                Number(employeeUserId)
            ) {
                throw new Error(
                    "PENDING_ACCESS_DENIED"
                );
            }

            if (
                new Date(
                    pending.expires_at
                ) <= new Date()
            ) {
                await pending.update(
                    {
                        status:
                            "cancelled",
                    },
                    {
                        transaction,
                    }
                );

                throw new Error(
                    "PENDING_EXPIRED"
                );
            }

            const qrToken =
                await QrToken.findByPk(
                    pending.qr_token_id,
                    {
                        transaction,
                    }
                );

            if (
                !qrToken ||
                qrToken.status !==
                "claimed"
            ) {
                throw new Error(
                    "QR_INVALID"
                );
            }

            if (
                Number(
                    qrToken
                        .claimed_by_user_id
                ) !==
                Number(employeeUserId)
            ) {
                throw new Error(
                    "QR_ACCESS_DENIED"
                );
            }

            const wallet =
                await Wallet.findByPk(
                    qrToken.wallet_id,
                    {
                        transaction,
                    }
                );

            if (!wallet) {
                throw new Error(
                    "WALLET_NOT_FOUND"
                );
            }

            const totalBalance =
                Number(
                    wallet
                        .paid_balance_kopecks ||
                    0
                ) +
                Number(
                    wallet
                        .bonus_balance_kopecks ||
                    0
                );

            if (
                amountKopecks >
                totalBalance
            ) {
                throw new Error(
                    "INSUFFICIENT_FUNDS"
                );
            }

            await pending.update(
                {
                    amount_kopecks:
                    amountKopecks,
                },
                {
                    transaction,
                }
            );

            const location =
                await Location.findByPk(
                    pending.location_id,
                    {
                        transaction,
                    }
                );

            return {
                pending,
                wallet,
                location,
                totalBalance,
            };
        }
    );
}


async function completePendingCharge({
                                         pendingChargeId,
                                         employeeUserId,
                                     }) {
    return sequelize.transaction(
        async (transaction) => {

            const pending =
                await PendingCharge.findByPk(
                    pendingChargeId,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (
                !pending ||
                pending.status !==
                "active"
            ) {
                throw new Error(
                    "PENDING_NOT_FOUND"
                );
            }

            if (
                Number(
                    pending.employee_user_id
                ) !==
                Number(employeeUserId)
            ) {
                throw new Error(
                    "PENDING_ACCESS_DENIED"
                );
            }

            if (
                new Date(
                    pending.expires_at
                ) <= new Date()
            ) {
                await pending.update(
                    {
                        status:
                            "cancelled",
                    },
                    {
                        transaction,
                    }
                );

                throw new Error(
                    "PENDING_EXPIRED"
                );
            }

            const amountKopecks =
                Number(
                    pending.amount_kopecks
                );

            if (
                !Number.isInteger(
                    amountKopecks
                ) ||
                amountKopecks <= 0
            ) {
                throw new Error(
                    "AMOUNT_NOT_SET"
                );
            }

            /*
             * Ещё раз проверяем,
             * что сотрудник всё ещё
             * относится к этой точке.
             */

            const hasLocation =
                await employeeHasLocation({
                    userId:
                    employeeUserId,

                    locationId:
                    pending.location_id,

                    transaction,
                });


            if (!hasLocation) {
                throw new Error(
                    "EMPLOYEE_LOCATION_ACCESS_DENIED"
                );
            }


            const location =
                await Location.findByPk(
                    pending.location_id,
                    {
                        transaction,
                    }
                );


            if (!location) {
                throw new Error(
                    "LOCATION_NOT_FOUND"
                );
            }

            const qrToken =
                await QrToken.findByPk(
                    pending.qr_token_id,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (
                !qrToken ||
                qrToken.status !==
                "claimed"
            ) {
                throw new Error(
                    "QR_INVALID"
                );
            }

            if (
                Number(
                    qrToken
                        .claimed_by_user_id
                ) !==
                Number(employeeUserId)
            ) {
                throw new Error(
                    "QR_ACCESS_DENIED"
                );
            }

            const eventId =
                `cc_${crypto.randomUUID()}`;

            /*
             * Деньги списываются
             * В ЭТОЙ ЖЕ транзакции MySQL.
             */

            const spendResult =
                await spendInsideTransaction({
                    walletId:
                    qrToken.wallet_id,

                    amountKopecks,

                    description:
                        `Оплата Camp Card — ${location.name}`,

                    externalRef:
                    eventId,

                    metadata: {
                        eventId,

                        locationId:
                       location
                            .id,

                        locationCode:
                       location
                            .code,

                        employeeUserId,

                        pendingChargeId:
                        pending.id,
                    },

                    transaction,
                });

            const redemption =
                await Redemption.create(
                    {
                        event_id:
                        eventId,

                        wallet_id:
                        qrToken.wallet_id,

                        location_id:
                        location.id,

                        employee_user_id:
                        employeeUserId,

                        qr_token_id:
                        qrToken.id,

                        wallet_transaction_id:
                        spendResult
                            .transaction
                            .id,

                        amount_kopecks:
                        amountKopecks,

                        paid_amount_kopecks:
                        spendResult
                            .paidSpentKopecks,

                        bonus_amount_kopecks:
                        spendResult
                            .bonusSpentKopecks,

                        business_cash_status:
                            "pending",

                        business_cash_attempts:
                            0,

                        status:
                            "completed",
                    },
                    {
                        transaction,
                    }
                );

            await qrToken.update(
                {
                    status:
                        "used",

                    used_at:
                        new Date(),
                },
                {
                    transaction,
                }
            );

            await pending.update(
                {
                    status:
                        "completed",
                },
                {
                    transaction,
                }
            );

            const wallet =
                await Wallet.findByPk(
                    qrToken.wallet_id,
                    {
                        transaction,
                    }
                );

            const customer =
                await User.findByPk(
                    wallet.user_id,
                    {
                        transaction,
                    }
                );

            return {
                redemption,

                location:
                employeeData.location,

                customer,

                ...spendResult,
            };
        }
    );
}


async function cancelPendingCharge({
                                       pendingChargeId,
                                       employeeUserId,
                                   }) {
    return sequelize.transaction(
        async (transaction) => {

            const pending =
                await PendingCharge.findByPk(
                    pendingChargeId,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (
                !pending ||
                pending.status !==
                "active"
            ) {
                return;
            }

            if (
                Number(
                    pending.employee_user_id
                ) !==
                Number(employeeUserId)
            ) {
                throw new Error(
                    "PENDING_ACCESS_DENIED"
                );
            }

            await pending.update(
                {
                    status:
                        "cancelled",
                },
                {
                    transaction,
                }
            );

            const qrToken =
                await QrToken.findByPk(
                    pending.qr_token_id,
                    {
                        transaction,
                        lock:
                        transaction.LOCK.UPDATE,
                    }
                );

            if (
                qrToken &&
                qrToken.status ===
                "claimed"
            ) {
                await qrToken.update(
                    {
                        status:
                            "expired",
                    },
                    {
                        transaction,
                    }
                );
            }
        }
    );
}


module.exports = {
    parseRublesToKopecks,
    claimPaymentQr,
    getActivePendingCharge,
    setPendingChargeAmount,
    completePendingCharge,
    cancelPendingCharge,
};