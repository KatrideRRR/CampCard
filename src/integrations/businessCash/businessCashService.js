const {
    Op,
} = require("sequelize");

const {
    Redemption,
    Location,
} = require("../../models");


function getConfig() {
    const apiUrl =
        String(
            process.env
                .BUSINESS_CASH_API_URL ||
            ""
        ).replace(/\/+$/, "");

    const secret =
        process.env
            .BUSINESS_CASH_API_SECRET;

    return {
        apiUrl,
        secret,
    };
}


async function sendToBusinessCash(
    redemption
) {
    const {
        apiUrl,
        secret,
    } = getConfig();

    if (!apiUrl) {
        throw new Error(
            "BUSINESS_CASH_API_URL_NOT_SET"
        );
    }

    if (!secret) {
        throw new Error(
            "BUSINESS_CASH_API_SECRET_NOT_SET"
        );
    }

    const location =
        redemption.location;

    if (!location) {
        throw new Error(
            "LOCATION_NOT_LOADED"
        );
    }

    const payload = {
        eventId:
        redemption.event_id,

        locationCode:
        location.code,

        amountKopecks:
            String(
                redemption
                    .amount_kopecks
            ),

        paidAmountKopecks:
            String(
                redemption
                    .paid_amount_kopecks
            ),

        bonusAmountKopecks:
            String(
                redemption
                    .bonus_amount_kopecks
            ),

        occurredAt:
            redemption.createdAt ||
            redemption.created_at ||
            new Date(),
    };

    const response =
        await fetch(
            `${apiUrl}/camp-card/redemptions`,
            {
                method: "POST",

                headers: {
                    "content-type":
                        "application/json",

                    "x-camp-card-secret":
                    secret,
                },

                body:
                    JSON.stringify(
                        payload
                    ),

                signal:
                    AbortSignal.timeout(
                        5000
                    ),
            }
        );

    const body =
        await response
            .json()
            .catch(() => null);

    if (!response.ok) {
        throw new Error(
            body?.error ||
            `BUSINESS_CASH_HTTP_${response.status}`
        );
    }

    return body;
}


async function syncRedemptionToBusinessCash(
    redemptionId
) {
    const redemption =
        await Redemption.findByPk(
            redemptionId,
            {
                include: [
                    {
                        model:
                        Location,

                        as:
                            "location",
                    },
                ],
            }
        );

    if (!redemption) {
        throw new Error(
            "REDEMPTION_NOT_FOUND"
        );
    }

    /*
     * Уже отправляли —
     * повторно не требуется.
     */
    if (
        redemption
            .business_cash_status ===
        "sent"
    ) {
        return {
            alreadySent: true,
        };
    }

    const attempts =
        Number(
            redemption
                .business_cash_attempts ||
            0
        ) + 1;

    try {
        const result =
            await sendToBusinessCash(
                redemption
            );

        await redemption.update({
            business_cash_status:
                "sent",

            business_cash_attempts:
            attempts,

            business_cash_last_error:
                null,
        });

        console.log(
            `[BusinessCash] ✅ ${redemption.event_id}`
        );

        return result;

    } catch (error) {

        await redemption.update({
            business_cash_status:
                "failed",

            business_cash_attempts:
            attempts,

            business_cash_last_error:
                String(
                    error.message ||
                    error
                ).slice(
                    0,
                    5000
                ),
        });

        console.error(
            `[BusinessCash] ❌ ${redemption.event_id}:`,
            error.message
        );

        throw error;
    }
}


async function syncPendingRedemptions() {
    const rows =
        await Redemption.findAll({
            where: {
                status:
                    "completed",

                business_cash_status: {
                    [Op.in]: [
                        "pending",
                        "failed",
                    ],
                },
            },

            order: [
                ["id", "ASC"],
            ],

            limit: 20,
        });

    for (const redemption of rows) {
        try {
            await syncRedemptionToBusinessCash(
                redemption.id
            );
        } catch (_) {
            /*
             * Ошибка уже записана
             * в redemption.
             *
             * Следующий цикл попробует
             * отправить снова.
             */
        }
    }
}


function startBusinessCashRetryWorker() {
    /*
     * Первая попытка после запуска.
     */

    setTimeout(
        () => {
            syncPendingRedemptions()
                .catch(
                    console.error
                );
        },
        3000
    );

    /*
     * Потом повторяем каждую минуту.
     */

    const timer =
        setInterval(
            () => {
                syncPendingRedemptions()
                    .catch(
                        console.error
                    );
            },
            60 * 1000
        );

    timer.unref?.();

    console.log(
        "✅ BusinessCash sync worker запущен"
    );
}


module.exports = {
    syncRedemptionToBusinessCash,
    syncPendingRedemptions,
    startBusinessCashRetryWorker,
};