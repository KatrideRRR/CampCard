const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const SberTopupPayment =
    sequelize.define(
        "SberTopupPayment",
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

            order_number: {
                type:
                    DataTypes.STRING(36),

                allowNull: false,
                unique: true,
            },

            sber_order_id: {
                type:
                    DataTypes.STRING(64),

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
             * Даже если потом поменяем Plan,
             * уже созданный платёж не изменится.
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
                "sber_topup_payments",

            indexes: [
                {
                    name:
                        "idx_sber_topup_wallet",

                    fields: [
                        "wallet_id",
                        "created_at",
                    ],
                },

                {
                    name:
                        "idx_sber_topup_status",

                    fields: [
                        "status",
                    ],
                },
            ],
        }
    );


module.exports =
    SberTopupPayment;