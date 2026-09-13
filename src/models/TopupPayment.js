const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const TopupPayment =
    sequelize.define(
        "TopupPayment",
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

            location_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
            },

            employee_user_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
            },

            topup_qr_token_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull: false,
                unique: true,
            },

            payment_method: {
                type:
                    DataTypes.ENUM(
                        "cash",
                        "sbp"
                    ),

                allowNull: false,
                defaultValue: "cash",
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
                defaultValue: 0,
            },

            total_credited_kopecks: {
                type:
                DataTypes.BIGINT,

                allowNull: false,
            },

            status: {
                type:
                    DataTypes.ENUM(
                        "pending",
                        "succeeded",
                        "cancelled",
                        "failed"
                    ),

                allowNull: false,
                defaultValue: "pending",
            },

            external_ref: {
                type:
                    DataTypes.STRING(255),

                allowNull: false,
                unique: true,
            },

            completed_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            metadata: {
                type: DataTypes.JSON,
                allowNull: true,
            },
        },
        {
            tableName:
                "topup_payments",

            indexes: [
                {
                    fields: [
                        "wallet_id",
                        "created_at",
                    ],
                },

                {
                    fields: [
                        "location_id",
                        "created_at",
                    ],
                },

                {
                    fields: [
                        "employee_user_id",
                        "created_at",
                    ],
                },

                {
                    fields: [
                        "status",
                    ],
                },
            ],
        }
    );


module.exports =
    TopupPayment;