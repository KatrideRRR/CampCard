const crypto =
    require("crypto");

const QRCode =
    require("qrcode");

const sequelize =
    require("../config/database");

const {
    User,
    Wallet,
    Location,
    EmployeeLocation,
    TopupQrToken,
} = require("../models");


function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}


async function createTopupQr(
    walletId
) {
    return sequelize.transaction(
        async (transaction) => {

            /*
             * Старые неиспользованные QR
             * для пополнения закрываем.
             */
            await TopupQrToken.update(
                {
                    status:
                        "expired",
                },
                {
                    where: {
                        wallet_id:
                        walletId,

                        status:
                            "active",
                    },

                    transaction,
                }
            );


            const rawToken =
                crypto
                    .randomBytes(24)
                    .toString(
                        "base64url"
                    );


            const tokenHash =
                hashToken(
                    rawToken
                );


            const ttlSeconds =
                Number(
                    process.env
                        .QR_TTL_SECONDS ||
                    90
                );


            const expiresAt =
                new Date(
                    Date.now() +
                    ttlSeconds * 1000
                );


            await TopupQrToken.create(
                {
                    wallet_id:
                    walletId,

                    token_hash:
                    tokenHash,

                    status:
                        "active",

                    expires_at:
                    expiresAt,
                },
                {
                    transaction,
                }
            );


            const botUsername =
                String(
                    process.env
                        .TELEGRAM_BOT_USERNAME ||
                    ""
                ).replace(
                    "@",
                    ""
                );


            if (!botUsername) {
                throw new Error(
                    "TELEGRAM_BOT_USERNAME_NOT_SET"
                );
            }


            const deepLink =
                `https://t.me/${botUsername}?start=topup_cash_${rawToken}`;

            const qrBuffer =
                await QRCode.toBuffer(
                    deepLink,
                    {
                        type:
                            "png",

                        width:
                            600,

                        margin:
                            2,
                    }
                );


            return {
                qrBuffer,
                expiresAt,
                deepLink,
            };
        }
    );
}


async function claimTopupQr({
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
                        transaction
                            .LOCK
                            .UPDATE,
                    }
                );


            if (
                !employee ||
                employee.status !==
                "active" ||
                ![
                    "employee",
                    "admin",
                    "owner",
                ].includes(
                    employee.role
                )
            ) {
                throw new Error(
                    "NOT_EMPLOYEE"
                );
            }


            const employeeLocation =
                await EmployeeLocation.findOne(
                    {
                        where: {
                            user_id:
                            employee.id,

                            is_active:
                                true,
                        },

                        transaction,

                        lock:
                        transaction
                            .LOCK
                            .UPDATE,
                    }
                );


            if (!employeeLocation) {
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


            const tokenHash =
                hashToken(
                    rawToken
                );


            const qrToken =
                await TopupQrToken.findOne(
                    {
                        where: {
                            token_hash:
                            tokenHash,
                        },

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
                "active"
            ) {
                throw new Error(
                    "QR_ALREADY_USED"
                );
            }


            if (
                new Date(
                    qrToken.expires_at
                ).getTime() <=
                Date.now()
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


            const wallet =
                await Wallet.findByPk(
                    qrToken.wallet_id,
                    {
                        transaction,

                        lock:
                        transaction
                            .LOCK
                            .UPDATE,
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


            if (!customer) {
                throw new Error(
                    "CUSTOMER_NOT_FOUND"
                );
            }


            await qrToken.update(
                {
                    status:
                        "claimed",

                    claimed_by_user_id:
                    employee.id,

                    claimed_at:
                        new Date(),
                },
                {
                    transaction,
                }
            );


            return {
                qrToken,
                wallet,
                customer,
                employee,
                location,
            };
        }
    );
}


module.exports = {
    createTopupQr,
    claimTopupQr,
};