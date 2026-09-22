const crypto =
    require("crypto");

const {
    fetch,
} = require("undici");

const {
    Wallet,
    User,
    Plan,
    WalletTransaction,
    TbankTopupPayment,
} = require("../models");

const {
    creditPlan,
} = require("./walletService");


function getApiBaseUrl() {
    return String(
        process.env.TBANK_API_BASE_URL ||
        "https://securepay.tinkoff.ru/v2"
    ).replace(/\/$/, "");
}


function checkConfig() {
    const required = [
        "TBANK_TERMINAL_KEY",
        "TBANK_PASSWORD",
        "TBANK_NOTIFICATION_URL",
        "TBANK_SUCCESS_URL",
        "TBANK_FAIL_URL",
    ];

    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(
                `TBANK_CONFIG_MISSING:${key}`
            );
        }
    }
}


/*
 * Т-Банк:
 * берём все простые параметры верхнего уровня,
 * исключаем Token и вложенные объекты,
 * добавляем Password,
 * сортируем по ключу,
 * соединяем значения,
 * SHA-256.
 */
function generateToken(
    payload
) {
    const tokenData = {};

    for (
        const [
            key,
            value,
        ]
        of Object.entries(payload)
        ) {

        if (
            key === "Token" ||
            value === null ||
            value === undefined ||
            typeof value === "object"
        ) {
            continue;
        }

        tokenData[key] =
            value;
    }

    tokenData.Password =
        process.env.TBANK_PASSWORD;


    const source =
        Object
            .keys(tokenData)
            .sort()
            .map(
                key =>
                    String(
                        tokenData[key]
                    )
            )
            .join("");


    return crypto
        .createHash("sha256")
        .update(
            source,
            "utf8"
        )
        .digest("hex");
}


async function tbankRequest(
    method,
    payload = {}
) {
    checkConfig();

    const body = {
        TerminalKey:
        process.env
            .TBANK_TERMINAL_KEY,

        ...payload,
    };


    body.Token =
        generateToken(
            body
        );


    const response =
        await fetch(
            `${getApiBaseUrl()}/${method}`,
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
            `TBANK_INVALID_RESPONSE:${text.slice(0, 500)}`
        );
    }


    if (!response.ok) {
        throw new Error(
            `TBANK_HTTP_${response.status}:${JSON.stringify(data)}`
        );
    }


    return data;
}


function makeOrderId() {
    const random =
        crypto
            .randomBytes(5)
            .toString("hex");

    return (
        `cc_${Date.now()}_${random}`
    );
}


async function createTbankTopup({
                                    walletId,
                                    planCode,
                                }) {

    const wallet =
        await Wallet.findByPk(
            walletId
        );


    if (
        !wallet ||
        wallet.status !== "active"
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


    const orderId =
        makeOrderId();


    const payment =
        await TbankTopupPayment
            .create({
                wallet_id:
                wallet.id,

                plan_id:
                plan.id,

                order_id:
                orderId,

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
            await tbankRequest(
                "Init",
                {
                    Amount:
                    paidAmount,

                    OrderId:
                    orderId,

                    Description:
                        `Пополнение Camp Card — ${plan.name}`,

                    NotificationURL:
                    process.env
                        .TBANK_NOTIFICATION_URL,

                    SuccessURL:
                    process.env
                        .TBANK_SUCCESS_URL,

                    FailURL:
                    process.env
                        .TBANK_FAIL_URL,

                    DATA: {
                        OperationInitiatorType:
                            "0",
                    },
                }
            );


        if (
            response.Success !== true
        ) {
            throw new Error(
                [
                    "TBANK_INIT",
                    response.ErrorCode,
                    response.Message,
                    response.Details,
                ]
                    .filter(Boolean)
                    .join(":")
            );
        }


        if (
            !response.PaymentId ||
            !response.PaymentURL
        ) {
            throw new Error(
                "TBANK_INIT_NO_PAYMENT"
            );
        }


        await payment.update({
            tbank_payment_id:
                String(
                    response.PaymentId
                ),

            payment_url:
            response.PaymentURL,

            bank_status:
                response.Status ||
                null,

            status:
                "pending",

            metadata: {
                initResponse: {
                    PaymentId:
                    response.PaymentId,

                    Status:
                    response.Status,

                    ErrorCode:
                    response.ErrorCode,
                },
            },
        });


        return {
            payment,
            plan,

            paymentId:
                String(
                    response.PaymentId
                ),

            paymentUrl:
            response.PaymentURL,
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


async function getTbankPaymentState(
    paymentId
) {
    return tbankRequest(
        "GetState",
        {
            PaymentId:
                String(
                    paymentId
                ),
        }
    );
}


function verifyTbankNotification(
    payload
) {
    if (
        !payload ||
        !payload.Token
    ) {
        return false;
    }


    const expected =
        generateToken(
            payload
        );

    const received =
        String(
            payload.Token
        );


    if (
        expected.length !==
        received.length
    ) {
        return false;
    }


    return crypto
        .timingSafeEqual(
            Buffer.from(
                expected,
                "utf8"
            ),
            Buffer.from(
                received,
                "utf8"
            )
        );
}


async function finalizeTbankTopup({
                                      paymentId = null,
                                      orderId = null,
                                  }) {

    let payment = null;


    if (paymentId) {
        payment =
            await TbankTopupPayment
                .findOne({
                    where: {
                        tbank_payment_id:
                            String(
                                paymentId
                            ),
                    },
                });
    }


    if (
        !payment &&
        orderId
    ) {
        payment =
            await TbankTopupPayment
                .findOne({
                    where: {
                        order_id:
                            String(
                                orderId
                            ),
                    },
                });
    }


    if (!payment) {
        throw new Error(
            "TBANK_TOPUP_NOT_FOUND"
        );
    }


    const state =
        await getTbankPaymentState(
            payment.tbank_payment_id
        );


    if (
        state.Success !== true
    ) {
        throw new Error(
            `TBANK_GET_STATE:${state.ErrorCode || ""}:${state.Message || ""}`
        );
    }


    await payment.update({
        bank_status:
            state.Status ||
            payment.bank_status,
    });


    /*
     * Одностадийный успешный платёж.
     */
    if (
        state.Status !==
        "CONFIRMED"
    ) {
        return {
            completed:
                false,

            payment,

            tbankState:
            state,
        };
    }


    const bankAmount =
        Number(
            state.Amount
        );


    if (
        bankAmount !==
        Number(
            payment
                .paid_amount_kopecks
        )
    ) {
        await payment.update({
            status:
                "failed",

            last_error:
                `AMOUNT_MISMATCH:${bankAmount}`,
        });

        throw new Error(
            "TBANK_AMOUNT_MISMATCH"
        );
    }


    if (
        state.OrderId &&
        String(
            state.OrderId
        ) !==
        String(
            payment.order_id
        )
    ) {
        throw new Error(
            "TBANK_ORDER_MISMATCH"
        );
    }


    const externalRef =
        `tbank_topup_${payment.order_id}`;


    /*
     * Идемпотентность.
     */
    let paidTransaction =
        await WalletTransaction
            .findOne({
                where: {
                    external_ref:
                        `${externalRef}:paid`,
                },
            });


    const alreadyCredited =
        Boolean(
            paidTransaction
        );


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
                    `Онлайн-пополнение через Т-Банк — ${payment.plan_name}`,
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

        bank_status:
            "CONFIRMED",

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

        alreadyCredited,
    };
}


module.exports = {
    generateToken,
    verifyTbankNotification,

    createTbankTopup,
    getTbankPaymentState,
    finalizeTbankTopup,
};