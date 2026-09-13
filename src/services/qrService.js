const crypto = require("crypto");
const QRCode = require("qrcode");

const sequelize = require("../config/database");

const {
    QrToken,
} = require("../models");

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

async function createPaymentQr(walletId) {
    return sequelize.transaction(
        async (transaction) => {

            /*
             * Старые активные QR этого клиента
             * сразу делаем недействительными.
             */

            await QrToken.update(
                {
                    status: "expired",
                },
                {
                    where: {
                        wallet_id: walletId,
                        status: "active",
                    },

                    transaction,
                }
            );

            const rawToken =
                crypto
                    .randomBytes(24)
                    .toString("base64url");

            const tokenHash =
                hashToken(rawToken);

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

            await QrToken.create(
                {
                    wallet_id: walletId,

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
                ).replace("@", "");

            if (!botUsername) {
                throw new Error(
                    "TELEGRAM_BOT_USERNAME_NOT_SET"
                );
            }

            /*
             * QR открывает Telegram-бот сотруднику.
             */

            const deepLink =
                `https://t.me/${botUsername}?start=pay_${rawToken}`;

            const qrBuffer =
                await QRCode.toBuffer(
                    deepLink,
                    {
                        type: "png",
                        width: 600,
                        margin: 2,
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

module.exports = {
    hashToken,
    createPaymentQr,
};