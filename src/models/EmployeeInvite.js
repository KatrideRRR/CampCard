const {
    DataTypes,
} = require("sequelize");

const sequelize =
    require("../config/database");


const EmployeeInvite =
    sequelize.define(
        "EmployeeInvite",
        {
            id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                autoIncrement:
                    true,

                primaryKey:
                    true,
            },

            token_hash: {
                type:
                    DataTypes.STRING(64),

                allowNull:
                    false,

                unique:
                    true,
            },

            created_by_user_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull:
                    false,
            },

            location_ids: {
                type:
                DataTypes.JSON,

                allowNull:
                    false,
            },

            status: {
                type:
                    DataTypes.ENUM(
                        "active",
                        "used",
                        "expired",
                        "cancelled"
                    ),

                allowNull:
                    false,

                defaultValue:
                    "active",
            },

            expires_at: {
                type:
                DataTypes.DATE,

                allowNull:
                    false,
            },

            used_by_user_id: {
                type:
                DataTypes.BIGINT.UNSIGNED,

                allowNull:
                    true,
            },

            used_at: {
                type:
                DataTypes.DATE,

                allowNull:
                    true,
            },
        },
        {
            tableName:
                "employee_invites",

            indexes: [
                {
                    fields: [
                        "status",
                        "expires_at",
                    ],
                },

                {
                    fields: [
                        "created_by_user_id",
                    ],
                },
            ],
        }
    );


module.exports =
    EmployeeInvite;