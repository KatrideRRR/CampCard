const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const TopupQrToken =
    sequelize.define(
        "TopupQrToken",
        {
            id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                autoIncrement: true,
                primaryKey: true,
            },

            wallet_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
            },

            token_hash: {
                type:
                    DataTypes.STRING(64),

                allowNull: false,
                unique: true,
            },

            status: {
                type:
                    DataTypes.ENUM(
                        "active",
                        "claimed",
                        "used",
                        "expired",
                        "cancelled"
                    ),

                allowNull: false,
                defaultValue: "active",
            },

            expires_at: {
                type: DataTypes.DATE,
                allowNull: false,
            },

            claimed_by_user_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: true,
            },

            claimed_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            used_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName:
                "topup_qr_tokens",

            indexes: [
                {
                    fields: [
                        "wallet_id",
                        "status",
                    ],
                },

                {
                    fields: [
                        "expires_at",
                    ],
                },
            ],
        }
    );


module.exports =
    TopupQrToken;