const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const TbankTopupPayment =
    sequelize.define(
        "TbankTopupPayment",
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

            plan_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
            },

            order_id: {
                type:
                    DataTypes.STRING(50),

                allowNull: false,
                unique: true,
            },

            tbank_payment_id: {
                type:
                    DataTypes.STRING(32),

                allowNull: true,
                unique: true,
            },

            payment_url: {
                type:
                DataTypes.TEXT,

                allowNull: true,
            },

            paid_amount_kopecks: {
                type:
                DataTypes.BIGINT,

                allowNull: false,
            },

            bonus_amount_kopecks: {
                type:
                DataTypes.BIGINT,

                allowNull: false,
            },

            total_credited_kopecks: {
                type:
                DataTypes.BIGINT,

                allowNull: false,
            },

            /*
             * Snapshot тарифа.
             */
            plan_code: {
                type:
                    DataTypes.STRING(50),

                allowNull: false,
            },

            plan_name: {
                type:
                    DataTypes.STRING(255),

                allowNull: false,
            },

            bonus_valid_days: {
                type:
                DataTypes.INTEGER.UNSIGNED,

                allowNull: true,
            },

            status: {
                type:
                    DataTypes.ENUM(
                        "creating",
                        "pending",
                        "succeeded",
                        "failed",
                        "cancelled"
                    ),

                allowNull: false,
                defaultValue:
                    "creating",
            },

            bank_status: {
                type:
                    DataTypes.STRING(50),

                allowNull: true,
            },

            credited_at: {
                type:
                DataTypes.DATE,

                allowNull: true,
            },

            last_error: {
                type:
                DataTypes.TEXT,

                allowNull: true,
            },

            metadata: {
                type:
                DataTypes.JSON,

                allowNull: true,
            },
        },
        {
            tableName:
                "tbank_topup_payments",

            indexes: [
                {
                    name:
                        "idx_tbank_topup_wallet",

                    fields: [
                        "wallet_id",
                        "created_at",
                    ],
                },

                {
                    name:
                        "idx_tbank_topup_status",

                    fields: [
                        "status",
                    ],
                },

                {
                    name:
                        "idx_tbank_topup_bank_status",

                    fields: [
                        "bank_status",
                    ],
                },
            ],
        }
    );


module.exports =
    TbankTopupPayment;