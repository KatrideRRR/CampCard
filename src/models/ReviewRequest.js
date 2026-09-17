const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const ReviewRequest =
    sequelize.define(
        "ReviewRequest",
        {
            id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                autoIncrement:
                    true,

                primaryKey:
                    true,
            },

            user_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull:
                    false,
            },

            location_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull:
                    false,
            },

            redemption_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull:
                    false,

                unique:
                    true,
            },

            status: {
                type:
                    DataTypes.ENUM(
                        "pending",
                        "sent",
                        "failed",
                        "cancelled"
                    ),

                allowNull:
                    false,

                defaultValue:
                    "pending",
            },

            scheduled_at: {
                type:
                DataTypes.DATE,

                allowNull:
                    false,
            },

            sent_at: {
                type:
                DataTypes.DATE,

                allowNull:
                    true,
            },

            attempts: {
                type:
                DataTypes.INTEGER.UNSIGNED,

                allowNull:
                    false,

                defaultValue:
                    0,
            },

            last_error: {
                type:
                DataTypes.TEXT,

                allowNull:
                    true,
            },
        },
        {
            tableName:
                "review_requests",

            indexes: [
                {
                    name:
                        "idx_review_requests_due",

                    fields: [
                        "status",
                        "scheduled_at",
                    ],
                },

                {
                    name:
                        "idx_review_requests_user_location",

                    fields: [
                        "user_id",
                        "location_id",
                        "status",
                    ],
                },
            ],
        }
    );


module.exports =
    ReviewRequest;