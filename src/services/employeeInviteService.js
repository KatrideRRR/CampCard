const crypto =
    require("crypto");

const sequelize =
    require("../config/database");

const {
    User,
    Location,
    EmployeeLocation,
    EmployeeInvite,
} = require("../models");


function hashToken(
    token
) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}


async function createEmployeeInvite({
                                        createdByUserId,
                                        locationIds,
                                    }) {
    const creator =
        await User.findByPk(
            createdByUserId
        );


    if (
        !creator ||
        creator.status !== "active" ||
        ![
            "owner",
            "admin",
        ].includes(
            creator.role
        )
    ) {
        throw new Error(
            "INVITE_ACCESS_DENIED"
        );
    }


    const ids =
        [
            ...new Set(
                locationIds.map(
                    Number
                )
            ),
        ].filter(
            Number.isFinite
        );


    if (
        ids.length === 0
    ) {
        throw new Error(
            "INVITE_LOCATIONS_EMPTY"
        );
    }


    const locations =
        await Location.findAll({
            where: {
                id:
                ids,

                is_active:
                    true,
            },

            order: [
                ["id", "ASC"],
            ],
        });


    if (
        locations.length !==
        ids.length
    ) {
        throw new Error(
            "INVITE_LOCATION_NOT_FOUND"
        );
    }


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
                .EMPLOYEE_INVITE_TTL_SECONDS ||
            86400
        );


    const expiresAt =
        new Date(
            Date.now() +
            ttlSeconds * 1000
        );


    const invite =
        await EmployeeInvite.create({
            token_hash:
            tokenHash,

            created_by_user_id:
            creator.id,

            location_ids:
                locations.map(
                    location =>
                        Number(
                            location.id
                        )
                ),

            status:
                "active",

            expires_at:
            expiresAt,
        });


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
        `https://t.me/${botUsername}?start=staff_${rawToken}`;


    return {
        invite,
        locations,
        deepLink,
        expiresAt,
    };
}


async function acceptEmployeeInvite({
                                        rawToken,
                                        userId,
                                    }) {
    return sequelize.transaction(
        async (
            transaction
        ) => {

            const tokenHash =
                hashToken(
                    rawToken
                );


            const invite =
                await EmployeeInvite.findOne({
                    where: {
                        token_hash:
                        tokenHash,
                    },

                    transaction,

                    lock:
                    transaction
                        .LOCK
                        .UPDATE,
                });


            if (!invite) {
                throw new Error(
                    "INVITE_NOT_FOUND"
                );
            }


            if (
                invite.status ===
                "used"
            ) {
                throw new Error(
                    "INVITE_ALREADY_USED"
                );
            }


            if (
                invite.status !==
                "active"
            ) {
                throw new Error(
                    "INVITE_NOT_ACTIVE"
                );
            }


            if (
                new Date(
                    invite.expires_at
                ) <=
                new Date()
            ) {
                await invite.update(
                    {
                        status:
                            "expired",
                    },
                    {
                        transaction,
                    }
                );

                throw new Error(
                    "INVITE_EXPIRED"
                );
            }


            const user =
                await User.findByPk(
                    userId,
                    {
                        transaction,

                        lock:
                        transaction
                            .LOCK
                            .UPDATE,
                    }
                );


            if (!user) {
                throw new Error(
                    "USER_NOT_FOUND"
                );
            }


            if (
                user.status !==
                "active"
            ) {
                throw new Error(
                    "USER_BLOCKED"
                );
            }


            if (
                ![
                    "owner",
                    "admin",
                ].includes(
                    user.role
                )
            ) {
                await user.update(
                    {
                        role:
                            "employee",
                    },
                    {
                        transaction,
                    }
                );
            }


            const locationIds =
                Array.isArray(
                    invite.location_ids
                )
                    ? invite.location_ids
                    : [];


            if (
                locationIds.length ===
                0
            ) {
                throw new Error(
                    "INVITE_LOCATIONS_EMPTY"
                );
            }


            const existingCurrent =
                await EmployeeLocation.findOne({
                    where: {
                        user_id:
                        user.id,

                        is_active:
                            true,

                        is_current:
                            true,
                    },

                    transaction,
                });


            let firstAssignment =
                null;

            const locations =
                [];


            for (
                const rawLocationId
                of locationIds
                ) {

                const locationId =
                    Number(
                        rawLocationId
                    );


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
                        "INVITE_LOCATION_NOT_FOUND"
                    );
                }


                let assignment =
                    await EmployeeLocation.findOne({
                        where: {
                            user_id:
                            user.id,

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
                                user.id,

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


                if (!firstAssignment) {
                    firstAssignment =
                        assignment;
                }


                locations.push(
                    location
                );
            }


            if (
                !existingCurrent &&
                firstAssignment
            ) {
                await firstAssignment.update(
                    {
                        is_current:
                            true,
                    },
                    {
                        transaction,
                    }
                );
            }


            await invite.update(
                {
                    status:
                        "used",

                    used_by_user_id:
                    user.id,

                    used_at:
                        new Date(),
                },
                {
                    transaction,
                }
            );


            return {
                invite,
                user,
                locations,
            };
        }
    );
}


async function getActiveLocations() {
    return Location.findAll({
        where: {
            is_active:
                true,
        },

        order: [
            ["id", "ASC"],
        ],
    });
}


module.exports = {
    createEmployeeInvite,
    acceptEmployeeInvite,
    getActiveLocations,
};