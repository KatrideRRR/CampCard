const sequelize =
    require("../config/database");

const {
    TopupPayment,
    TopupQrToken,
    WalletTransaction,
    Wallet,
    Plan,
    User,
    Location,
    EmployeeLocation,
} = require("../models");

const {
    creditPlan,
} = require("./walletService");


function toNumber(value) {
    return Number(
        value || 0
    );
}


function validatePaymentMethod(
    paymentMethod
) {
    if (
        paymentMethod !==
        "cash"
    ) {
        throw new Error(
            "INVALID_PAYMENT_METHOD"
        );
    }
}


function isClaimExpired(
    qrToken
) {
    const ttlSeconds =
        Number(
            process.env
                .TOPUP_CONFIRM_TTL_SECONDS ||
            180
        );

    const claimedAt =
        qrToken.claimed_at
            ? new Date(
                qrToken.claimed_at
            ).getTime()
            : 0;

    if (!claimedAt) {
        return true;
    }

    return (
        Date.now() >
        claimedAt +
        ttlSeconds * 1000
    );
}


async function prepareManualTopup({
                                      qrTokenId,
                                      employeeUserId,
                                      planCode,
                                      paymentMethod,
                                  }) {
    validatePaymentMethod(
        paymentMethod
    );


    const plan =
        await Plan.findOne({
            where: {
                code:
                planCode,

                is_active:
                    true,
            },
        });


    if (!plan) {
        throw new Error(
            "PLAN_NOT_FOUND"
        );
    }


    return sequelize.transaction(
        async (transaction) => {

            const qrToken =
                await TopupQrToken.findByPk(
                    qrTokenId,
                    {
                        transaction,

                        lock:
                        transaction
                            .LOCK
                            .UPDATE,
                    }
                );


            if (!qrToken) {
                throw new Error(
                    "QR_NOT_FOUND"
                );
            }


            if (
                qrToken.status !==
                "claimed"
            ) {
                throw new Error(
                    "QR_NOT_CLAIMED"
                );
            }


            if (
                Number(
                    qrToken
                        .claimed_by_user_id
                ) !==
                Number(
                    employeeUserId
                )
            ) {
                throw new Error(
                    "QR_CLAIMED_BY_OTHER"
                );
            }


            if (
                isClaimExpired(
                    qrToken
                )
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


            const employee =
                await User.findByPk(
                    employeeUserId,
                    {
                        transaction,
                    }
                );


            if (!employee) {
                throw new Error(
                    "EMPLOYEE_NOT_FOUND"
                );
            }


            const employeeLocation =
                await EmployeeLocation
                    .findOne({
                        where: {
                            user_id:
                            employee.id,

                            is_active:
                                true,
                        },

                        transaction,
                    });


            if (
                !employeeLocation
            ) {
                throw new Error(
                    "EMPLOYEE_LOCATION_NOT_SET"
                );
            }


            const location =
                await Location.findByPk(
                    employeeLocation
                        .location_id,
                    {
                        transaction,
                    }
                );


            if (!location) {
                throw new Error(
                    "LOCATION_NOT_FOUND"
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


            const customer =
                await User.findByPk(
                    wallet.user_id,
                    {
                        transaction,
                    }
                );


            const paidAmount =
                toNumber(
                    plan
                        .topup_amount_kopecks
                );

            const bonusAmount =
                toNumber(
                    plan
                        .bonus_amount_kopecks
                );

            const totalCredited =
                paidAmount +
                bonusAmount;


            let topup =
                await TopupPayment.findOne({
                    where: {
                        topup_qr_token_id:
                        qrToken.id,
                    },

                    transaction,

                    lock:
                    transaction
                        .LOCK
                        .UPDATE,
                });


            if (topup) {

                if (
                    topup.status ===
                    "succeeded"
                ) {
                    throw new Error(
                        "TOPUP_ALREADY_COMPLETED"
                    );
                }


                if (
                    topup.status ===
                    "cancelled"
                ) {
                    throw new Error(
                        "TOPUP_CANCELLED"
                    );
                }


                await topup.update(
                    {
                        plan_id:
                        plan.id,

                        location_id:
                        location.id,

                        employee_user_id:
                        employee.id,

                        payment_method:
                        paymentMethod,

                        paid_amount_kopecks:
                        paidAmount,

                        bonus_amount_kopecks:
                        bonusAmount,

                        total_credited_kopecks:
                        totalCredited,

                        external_ref:
                            `manual_${paymentMethod}_topup_${qrToken.id}`,
                    },
                    {
                        transaction,
                    }
                );

            } else {

                topup =
                    await TopupPayment.create(
                        {
                            wallet_id:
                            wallet.id,

                            plan_id:
                            plan.id,

                            location_id:
                            location.id,

                            employee_user_id:
                            employee.id,

                            topup_qr_token_id:
                            qrToken.id,

                            payment_method:
                            paymentMethod,

                            paid_amount_kopecks:
                            paidAmount,

                            bonus_amount_kopecks:
                            bonusAmount,

                            total_credited_kopecks:
                            totalCredited,

                            status:
                                "pending",

                            external_ref:
                                `manual_${paymentMethod}_topup_${qrToken.id}`,

                            metadata: {
                                source:
                                    "telegram_cashier",

                                paymentMethod,
                            },
                        },
                        {
                            transaction,
                        }
                    );
            }


            return {
                topup,
                qrToken,
                wallet,
                customer,
                employee,
                location,
                plan,
            };
        }
    );
}


async function completeManualTopup({
                                       topupPaymentId,
                                       employeeUserId,
                                   }) {
    let topup =
        await TopupPayment.findByPk(
            topupPaymentId
        );


    if (!topup) {
        throw new Error(
            "TOPUP_NOT_FOUND"
        );
    }


    if (
        Number(
            topup.employee_user_id
        ) !==
        Number(
            employeeUserId
        )
    ) {
        throw new Error(
            "TOPUP_OTHER_EMPLOYEE"
        );
    }


    if (
        topup.status ===
        "cancelled"
    ) {
        throw new Error(
            "TOPUP_CANCELLED"
        );
    }


    const plan =
        await Plan.findByPk(
            topup.plan_id
        );


    if (!plan) {
        throw new Error(
            "PLAN_NOT_FOUND"
        );
    }


    let paidTransaction =
        await WalletTransaction.findOne({
            where: {
                external_ref:
                    `${topup.external_ref}:paid`,
            },
        });


    if (!paidTransaction) {

        const description =
            `Наличное пополнение ${plan.name}`;


        try {

            await creditPlan({
                walletId:
                topup.wallet_id,

                plan,

                externalRef:
                topup.external_ref,

                description,
            });

        } catch (error) {

            paidTransaction =
                await WalletTransaction.findOne({
                    where: {
                        external_ref:
                            `${topup.external_ref}:paid`,
                    },
                });


            if (!paidTransaction) {
                throw error;
            }
        }
    }


    await sequelize.transaction(
        async (transaction) => {

            const lockedTopup =
                await TopupPayment.findByPk(
                    topup.id,
                    {
                        transaction,

                        lock:
                        transaction
                            .LOCK
                            .UPDATE,
                    }
                );


            await lockedTopup.update(
                {
                    status:
                        "succeeded",

                    completed_at:
                        new Date(),
                },
                {
                    transaction,
                }
            );


            const qrToken =
                await TopupQrToken.findByPk(
                    lockedTopup
                        .topup_qr_token_id,
                    {
                        transaction,
                    }
                );


            if (qrToken) {
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
            }
        }
    );


    topup =
        await TopupPayment.findByPk(
            topup.id
        );


    const wallet =
        await Wallet.findByPk(
            topup.wallet_id
        );


    const customer =
        await User.findByPk(
            wallet.user_id
        );


    const location =
        await Location.findByPk(
            topup.location_id
        );


    return {
        topup,
        wallet,
        customer,
        location,
        plan,
    };
}


async function cancelManualTopup({
                                     topupPaymentId,
                                     employeeUserId,
                                 }) {
    return sequelize.transaction(
        async (transaction) => {

            const topup =
                await TopupPayment.findByPk(
                    topupPaymentId,
                    {
                        transaction,

                        lock:
                        transaction
                            .LOCK
                            .UPDATE,
                    }
                );


            if (!topup) {
                throw new Error(
                    "TOPUP_NOT_FOUND"
                );
            }


            if (
                Number(
                    topup
                        .employee_user_id
                ) !==
                Number(
                    employeeUserId
                )
            ) {
                throw new Error(
                    "TOPUP_OTHER_EMPLOYEE"
                );
            }


            if (
                topup.status ===
                "succeeded"
            ) {
                throw new Error(
                    "TOPUP_ALREADY_COMPLETED"
                );
            }


            await topup.update(
                {
                    status:
                        "cancelled",
                },
                {
                    transaction,
                }
            );


            const qrToken =
                await TopupQrToken.findByPk(
                    topup
                        .topup_qr_token_id,
                    {
                        transaction,
                    }
                );


            if (qrToken) {
                await qrToken.update(
                    {
                        status:
                            "cancelled",
                    },
                    {
                        transaction,
                    }
                );
            }


            return topup;
        }
    );
}


module.exports = {
    prepareManualTopup,
    completeManualTopup,
    cancelManualTopup,
};