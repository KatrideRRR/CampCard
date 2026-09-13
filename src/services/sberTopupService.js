const crypto =
    require("crypto");

const sequelize =
    require("../config/database");

const {
    Wallet,
    User,
    Plan,
    WalletTransaction,
    SberTopupPayment,
} = require("../models");

const {
    creditPlan,
} = require("./walletService");


function getApiBaseUrl() {
    return String(
        process.env
            .SBER_API_BASE_URL ||
        ""
    ).replace(
        /\/$/,
        ""
    );
}


function checkConfig() {
    const required = [
        "SBER_API_BASE_URL",
        "SBER_USERNAME",
        "SBER_PASSWORD",
        "SBER_RETURN_URL",
        "SBER_FAIL_URL",
        "SBER_CALLBACK_URL",
    ];

    for (
        const key
        of required
        ) {
        if (
            !process.env[key]
        ) {
            throw new Error(
                `SBER_CONFIG_MISSING:${key}`
            );
        }
    }
}


async function sberRequest(
    path,
    body
) {
    checkConfig();


    const response =
        await fetch(
            `${getApiBaseUrl()}${path}`,
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify(
                        body
                    ),
            }
        );


    const text =
        await response.text();


    let data;

    try {
        data =
            JSON.parse(
                text
            );
    } catch (_) {
        throw new Error(
            `SBER_INVALID_RESPONSE:${text.slice(0, 500)}`
        );
    }


    if (
        !response.ok
    ) {
        throw new Error(
            `SBER_HTTP_${response.status}:${JSON.stringify(data)}`
        );
    }


    return data;
}


function makeOrderNumber() {
    const random =
        crypto
            .randomBytes(5)
            .toString("hex");

    /*
     * Максимум 36 символов.
     */
    return (
        `cc_${Date.now()}_${random}`
    );
}


async function createSberTopup({
                                   walletId,
                                   planCode,
                               }) {
    const wallet =
        await Wallet.findByPk(
            walletId
        );


    if (
        !wallet ||
        wallet.status !==
        "active"
    ) {
        throw new Error(
            "WALLET_NOT_FOUND"
        );
    }


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


    const paidAmount =
        Number(
            plan
                .topup_amount_kopecks
        );

    const bonusAmount =
        Number(
            plan
                .bonus_amount_kopecks ||
            0
        );


    const orderNumber =
        makeOrderNumber();


    const payment =
        await SberTopupPayment.create({
            wallet_id:
            wallet.id,

            plan_id:
            plan.id,

            order_number:
            orderNumber,

            paid_amount_kopecks:
            paidAmount,

            bonus_amount_kopecks:
            bonusAmount,

            total_credited_kopecks:
                paidAmount +
                bonusAmount,

            plan_code:
            plan.code,

            plan_name:
            plan.name,

            bonus_valid_days:
            plan.bonus_valid_days,

            status:
                "creating",
        });


    try {
        const response =
            await sberRequest(
                "/register.do",
                {
                    userName:
                    process.env
                        .SBER_USERNAME,

                    password:
                    process.env
                        .SBER_PASSWORD,

                    orderNumber,

                    amount:
                    paidAmount,

                    currency:
                        "643",

                    returnUrl:
                    process.env
                        .SBER_RETURN_URL,

                    failUrl:
                    process.env
                        .SBER_FAIL_URL,

                    callbackUrl:
                    process.env
                        .SBER_CALLBACK_URL,

                    description:
                        `Пополнение Camp Card ${plan.name}`,
                }
            );


        if (
            response.errorCode &&
            String(
                response.errorCode
            ) !== "0"
        ) {
            throw new Error(
                `SBER_REGISTER:${response.errorCode}:${response.errorMessage || ""}`
            );
        }


        if (
            !response.orderId ||
            !response.formUrl
        ) {
            throw new Error(
                "SBER_REGISTER_NO_ORDER"
            );
        }


        await payment.update({
            sber_order_id:
            response.orderId,

            payment_url:
            response.formUrl,

            status:
                "pending",

            metadata: {
                registerResponse: {
                    orderId:
                    response.orderId,
                },
            },
        });


        return {
            payment,
            plan,

            orderId:
            response.orderId,

            paymentUrl:
            response.formUrl,
        };

    } catch (error) {

        await payment.update({
            status:
                "failed",

            last_error:
                String(
                    error.message ||
                    error
                ).slice(
                    0,
                    5000
                ),
        });


        throw error;
    }
}


async function getSberOrderStatus(
    sberOrderId
) {
    return sberRequest(
        "/getOrderStatusExtended.do",
        {
            userName:
            process.env
                .SBER_USERNAME,

            password:
            process.env
                .SBER_PASSWORD,

            orderId:
            sberOrderId,

            language:
                "ru",
        }
    );
}


async function finalizeSberTopup({
                                     sberOrderId,
                                     orderNumber = null,
                                 }) {
    let payment = null;


    if (sberOrderId) {
        payment =
            await SberTopupPayment
                .findOne({
                    where: {
                        sber_order_id:
                        sberOrderId,
                    },
                });
    }


    if (
        !payment &&
        orderNumber
    ) {
        payment =
            await SberTopupPayment
                .findOne({
                    where: {
                        order_number:
                        orderNumber,
                    },
                });
    }


    if (!payment) {
        throw new Error(
            "SBER_TOPUP_NOT_FOUND"
        );
    }


    const status =
        await getSberOrderStatus(
            payment.sber_order_id
        );


    /*
     * Для полностью оплаченного
     * одностадийного заказа.
     */
    const deposited =
        Number(
            status.orderStatus
        ) === 2 &&
        status
            .paymentAmountInfo
            ?.paymentState ===
        "DEPOSITED";


    if (!deposited) {
        return {
            completed:
                false,

            payment,

            sberStatus:
            status,
        };
    }


    const sberAmount =
        Number(
            status.amount
        );


    if (
        sberAmount !==
        Number(
            payment
                .paid_amount_kopecks
        )
    ) {
        await payment.update({
            status:
                "failed",

            last_error:
                `AMOUNT_MISMATCH:${sberAmount}`,
        });

        throw new Error(
            "SBER_AMOUNT_MISMATCH"
        );
    }


    const externalRef =
        `sber_topup_${payment.order_number}`;


    /*
     * Проверяем ledger:
     * возможно callback пришёл повторно
     * или сервер упал сразу после
     * зачисления.
     */
    let paidTransaction =
        await WalletTransaction.findOne({
            where: {
                external_ref:
                    `${externalRef}:paid`,
            },
        });


    if (!paidTransaction) {

        const planSnapshot = {
            id:
            payment.plan_id,

            code:
            payment.plan_code,

            name:
            payment.plan_name,

            topup_amount_kopecks:
            payment
                .paid_amount_kopecks,

            bonus_amount_kopecks:
            payment
                .bonus_amount_kopecks,

            bonus_valid_days:
            payment
                .bonus_valid_days,
        };


        try {

            await creditPlan({
                walletId:
                payment.wallet_id,

                plan:
                planSnapshot,

                externalRef,

                description:
                    `Онлайн-пополнение через Сбер — ${payment.plan_name}`,
            });

        } catch (error) {

            paidTransaction =
                await WalletTransaction
                    .findOne({
                        where: {
                            external_ref:
                                `${externalRef}:paid`,
                        },
                    });


            if (!paidTransaction) {
                throw error;
            }
        }
    }


    await payment.update({
        status:
            "succeeded",

        credited_at:
            payment.credited_at ||
            new Date(),

        last_error:
            null,
    });


    const wallet =
        await Wallet.findByPk(
            payment.wallet_id
        );


    const customer =
        await User.findByPk(
            wallet.user_id
        );


    return {
        completed:
            true,

        payment,

        wallet,
        customer,

        alreadyCredited:
            Boolean(
                paidTransaction
            ),
    };
}


module.exports = {
    createSberTopup,
    finalizeSberTopup,
    getSberOrderStatus,
};