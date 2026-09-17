const sequelize =
    require("../config/database");

const {
    User,
    Location,
    EmployeeLocation,
} = require("../models");


async function assertManager({
                                 userId,
                                 transaction = null,
                             }) {
    const user =
        await User.findByPk(
            userId,
            {
                transaction,
            }
        );


    if (
        !user ||
        user.status !== "active" ||
        ![
            "owner",
            "admin",
        ].includes(
            user.role
        )
    ) {
        throw new Error(
            "MANAGER_ACCESS_DENIED"
        );
    }


    return user;
}


async function loadAssignments({
                                   employeeUserId,
                                   transaction = null,
                               }) {
    const assignments =
        await EmployeeLocation.findAll({
            where: {
                user_id:
                employeeUserId,

                is_active:
                    true,
            },

            order: [
                ["is_current", "DESC"],
                ["id", "ASC"],
            ],

            transaction,
        });


    const result = [];


    for (
        const assignment
        of assignments
        ) {
        const location =
            await Location.findByPk(
                assignment.location_id,
                {
                    transaction,
                }
            );


        if (location) {
            result.push({
                assignment,
                location,
            });
        }
    }


    return result;
}


async function getEmployees({
                                managerUserId,
                            }) {
    await assertManager({
        userId:
        managerUserId,
    });


    const employees =
        await User.findAll({
            where: {
                role:
                    "employee",

                status:
                    "active",
            },

            order: [
                ["first_name", "ASC"],
                ["id", "ASC"],
            ],
        });


    const result = [];


    for (
        const employee
        of employees
        ) {
        const assignments =
            await loadAssignments({
                employeeUserId:
                employee.id,
            });


        result.push({
            employee,
            assignments,
        });
    }


    return result;
}


async function getEmployeeDetails({
                                      managerUserId,
                                      employeeUserId,
                                  }) {
    await assertManager({
        userId:
        managerUserId,
    });


    const employee =
        await User.findByPk(
            employeeUserId
        );


    if (
        !employee ||
        employee.status !== "active" ||
        employee.role !== "employee"
    ) {
        throw new Error(
            "EMPLOYEE_NOT_FOUND"
        );
    }


    const assignments =
        await loadAssignments({
            employeeUserId:
            employee.id,
        });


    const locations =
        await Location.findAll({
            where: {
                is_active:
                    true,
            },

            order: [
                ["id", "ASC"],
            ],
        });


    const assignedIds =
        new Set(
            assignments.map(
                ({
                     location,
                 }) =>
                    Number(
                        location.id
                    )
            )
        );


    const availableLocations =
        locations.filter(
            location =>
                !assignedIds.has(
                    Number(
                        location.id
                    )
                )
        );


    return {
        employee,
        assignments,
        availableLocations,
    };
}


async function addEmployeeLocation({
                                       managerUserId,
                                       employeeUserId,
                                       locationId,
                                   }) {
    return sequelize.transaction(
        async (
            transaction
        ) => {

            await assertManager({
                userId:
                managerUserId,

                transaction,
            });


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
                employee.role !==
                "employee" ||
                employee.status !==
                "active"
            ) {
                throw new Error(
                    "EMPLOYEE_NOT_FOUND"
                );
            }


            const location =
                await Location.findByPk(
                    locationId,
                    {
                        transaction,
                    }
                );


            if (
                !location ||
                !location.is_active
            ) {
                throw new Error(
                    "LOCATION_NOT_FOUND"
                );
            }


            let assignment =
                await EmployeeLocation.findOne({
                    where: {
                        user_id:
                        employee.id,

                        location_id:
                        location.id,
                    },

                    transaction,

                    lock:
                    transaction
                        .LOCK
                        .UPDATE,
                });


            if (assignment) {
                await assignment.update(
                    {
                        is_active:
                            true,
                    },
                    {
                        transaction,
                    }
                );
            } else {
                assignment =
                    await EmployeeLocation.create(
                        {
                            user_id:
                            employee.id,

                            location_id:
                            location.id,

                            is_active:
                                true,

                            is_current:
                                false,
                        },
                        {
                            transaction,
                        }
                    );
            }


            const current =
                await EmployeeLocation.findOne({
                    where: {
                        user_id:
                        employee.id,

                        is_active:
                            true,

                        is_current:
                            true,
                    },

                    transaction,
                });


            if (!current) {
                await assignment.update(
                    {
                        is_current:
                            true,
                    },
                    {
                        transaction,
                    }
                );
            }


            return {
                employee,
                location,
            };
        }
    );
}


async function removeEmployeeLocation({
                                          managerUserId,
                                          employeeUserId,
                                          locationId,
                                      }) {
    return sequelize.transaction(
        async (
            transaction
        ) => {

            await assertManager({
                userId:
                managerUserId,

                transaction,
            });


            const employee =
                await User.findByPk(
                    employeeUserId,
                    {
                        transaction,
                    }
                );


            if (
                !employee ||
                employee.role !==
                "employee"
            ) {
                throw new Error(
                    "EMPLOYEE_NOT_FOUND"
                );
            }


            const assignments =
                await EmployeeLocation.findAll({
                    where: {
                        user_id:
                        employee.id,

                        is_active:
                            true,
                    },

                    order: [
                        ["id", "ASC"],
                    ],

                    transaction,

                    lock:
                    transaction
                        .LOCK
                        .UPDATE,
                });


            if (
                assignments.length <=
                1
            ) {
                throw new Error(
                    "EMPLOYEE_LAST_LOCATION"
                );
            }


            const assignment =
                assignments.find(
                    item =>
                        Number(
                            item.location_id
                        ) ===
                        Number(
                            locationId
                        )
                );


            if (!assignment) {
                throw new Error(
                    "EMPLOYEE_LOCATION_NOT_FOUND"
                );
            }


            const location =
                await Location.findByPk(
                    assignment.location_id,
                    {
                        transaction,
                    }
                );


            const wasCurrent =
                Boolean(
                    assignment
                        .is_current
                );


            await assignment.update(
                {
                    is_active:
                        false,

                    is_current:
                        false,
                },
                {
                    transaction,
                }
            );


            let newCurrentLocation =
                null;


            if (wasCurrent) {
                const replacement =
                    assignments.find(
                        item =>
                            Number(
                                item.id
                            ) !==
                            Number(
                                assignment.id
                            )
                    );


                if (replacement) {
                    await replacement.update(
                        {
                            is_current:
                                true,
                        },
                        {
                            transaction,
                        }
                    );


                    newCurrentLocation =
                        await Location.findByPk(
                            replacement
                                .location_id,
                            {
                                transaction,
                            }
                        );
                }
            }


            return {
                employee,
                location,
                newCurrentLocation,
            };
        }
    );
}


async function revokeEmployeeAccess({
                                        managerUserId,
                                        employeeUserId,
                                    }) {
    return sequelize.transaction(
        async (
            transaction
        ) => {

            await assertManager({
                userId:
                managerUserId,

                transaction,
            });


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
                employee.role !==
                "employee"
            ) {
                throw new Error(
                    "EMPLOYEE_NOT_FOUND"
                );
            }


            await EmployeeLocation.update(
                {
                    is_active:
                        false,

                    is_current:
                        false,
                },
                {
                    where: {
                        user_id:
                        employee.id,
                    },

                    transaction,
                }
            );


            await employee.update(
                {
                    role:
                        "customer",
                },
                {
                    transaction,
                }
            );


            return {
                employee,
            };
        }
    );
}


module.exports = {
    getEmployees,
    getEmployeeDetails,
    addEmployeeLocation,
    removeEmployeeLocation,
    revokeEmployeeAccess,
};