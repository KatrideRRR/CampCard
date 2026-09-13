const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const BonusExpiryNotification =
    sequelize.define(
        "BonusExpiryNotification",
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

            notification_type: {
                type:
                    DataTypes.ENUM(
                        "3d",
                        "1d"
                    ),

                allowNull: false,
            },

            expires_on: {
                type:
                DataTypes.DATEONLY,

                allowNull: false,
            },

            amount_kopecks: {
                type:
                DataTypes.BIGINT,

                allowNull: false,
            },

            status: {
                type:
                    DataTypes.ENUM(
                        "pending",
                        "sent",
                        "failed"
                    ),

                allowNull: false,
                defaultValue:
                    "pending",
            },

            attempts: {
                type:
                DataTypes.INTEGER.UNSIGNED,

                allowNull: false,
                defaultValue: 0,
            },

            last_error: {
                type:
                DataTypes.TEXT,

                allowNull: true,
            },

            sent_at: {
                type:
                DataTypes.DATE,

                allowNull: true,
            },
        },
        {
            tableName:
                "bonus_expiry_notifications",

            indexes: [
                {
                    name: "uniq_bonus_expiry_notice",

                    unique: true,

                    fields: [
                        "wallet_id",
                        "notification_type",
                        "expires_on",
                    ],
                },
            ],
        }
    );


module.exports =
    BonusExpiryNotification;