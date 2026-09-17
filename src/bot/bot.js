const {
    Telegraf,
    Markup,
} = require("telegraf");

const {
    getActivePlans,
    getPlanByCode,
} = require("../services/planService");

const {
    formatKopecks,
    getOrCreateTelegramUser,
    getWalletForUser,
    creditPlan,
    buildWalletText,
} = require("../services/walletService");

const {
    getWalletHistory,
    buildHistoryText,
} = require(
    "../services/historyService"
);

const {
    createTopupQr,
    claimTopupQr,
} = require(
    "../services/topupQrService"
);

const {
    createEmployeeInvite,
    acceptEmployeeInvite,
    getActiveLocations,
} = require(
    "../services/employeeInviteService"
);

const {
    getEmployeeLocations,
    setCurrentEmployeeLocation,
} = require(
    "../services/employeeLocationService"
);

const {
    scheduleReviewRequest,
} = require(
    "../services/reviewRequestService"
);

const {
    getEmployees,
    getEmployeeDetails,
    addEmployeeLocation,
    removeEmployeeLocation,
    revokeEmployeeAccess,
} = require(
    "../services/employeeManagementService"
);

const {
    prepareManualTopup,
    completeManualTopup,
    cancelManualTopup,
} = require(
    "../services/manualTopupService"
);

const {
    createSberTopup,
} = require(
    "../services/sberTopupService"
);

const {
    getCardOverview,
    buildCardOverviewText,
} = require(
    "../services/cardOverviewService"
);

const {
    parseRublesToKopecks,
    claimPaymentQr,
    getActivePendingCharge,
    setPendingChargeAmount,
    completePendingCharge,
    cancelPendingCharge,
} = require("../services/redemptionService");

const {
    User,
    EmployeeLocation,
} = require("../models");

const {
    SocksProxyAgent,
} = require("socks-proxy-agent");

const {
    getLocationByCode,
} = require("../services/locationService");

const {
    createPaymentQr,
} = require("../services/qrService");

const {
    syncRedemptionToBusinessCash,
} = require(
    "../integrations/businessCash/businessCashService"
);

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
        "Не указан TELEGRAM_BOT_TOKEN"
    );
}

const telegramProxyUrl =
    process.env.TELEGRAM_PROXY_URL;

const telegramAgent =
    telegramProxyUrl
        ? new SocksProxyAgent(
            telegramProxyUrl
        )
        : undefined;

const telegramApiRoot =
    process.env.TELEGRAM_API_ROOT ||
    "https://api.telegram.org";

const bot =
    new Telegraf(
        process.env.TELEGRAM_BOT_TOKEN,
        {
            telegram: {
                apiRoot:
                telegramApiRoot,

                ...(telegramAgent
                    ? {
                        agent:
                        telegramAgent,
                    }
                    : {}),
            },
        }
    );

const customerKeyboard = Markup.keyboard([
    [
        "💳 Моя Camp Card",
        "📱 Показать QR",
    ],
    [
        "🎁 Пакеты",
        "ℹ️ Помощь",
    ],

])
    .resize()
    .persistent();

const employeeKeyboard = Markup.keyboard([
    [
        "📍 Рабочая точка",
    ],
    [
        "💳 Моя Camp Card",
        "📱 Показать QR",
    ],
    [
        "🎁 Пакеты",
        "ℹ️ Помощь",
    ],
])
    .resize()
    .persistent();


const ownerKeyboard = Markup.keyboard([
    [
        "👥 Сотрудники",
        "📍 Рабочая точка",
    ],
    [
        "💳 Моя Camp Card",
        "📱 Показать QR",
    ],
    [
        "🎁 Пакеты",
        "ℹ️ Помощь",
    ],
])
    .resize()
    .persistent();

function getMainKeyboard(
    user
) {
    if (
        [
            "owner",
            "admin",
        ].includes(
            user.role
        )
    ) {
        return ownerKeyboard;
    }


    if (
        user.role ===
        "employee"
    ) {
        return employeeKeyboard;
    }


    return customerKeyboard;
}

function buildCardActionsKeyboard() {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback(
                "💰 Пополнить",
                "card_topup"
            ),
        ],
        [
            Markup.button.callback(
                "📜 История",
                "card_history"
            ),
        ],
    ]);
}

async function safeEditMessageText(
    ctx,
    text,
    extra
) {
    try {
        return await ctx.editMessageText(
            text,
            extra
        );
    } catch (error) {
        const description =
            error?.response?.description ||
            "";

        if (
            error?.response?.error_code === 400 &&
            description.includes(
                "message is not modified"
            )
        ) {
            return null;
        }

        throw error;
    }
}

function getEmployeeDisplayName(
    employee
) {
    const fullName =
        [
            employee.first_name,
            employee.last_name,
        ]
            .filter(Boolean)
            .join(" ")
            .trim();


    if (fullName) {
        return fullName;
    }


    if (employee.username) {
        return `@${employee.username}`;
    }


    return `Сотрудник #${employee.id}`;
}


async function showEmployeesMenu({
                                     ctx,
                                     managerUserId,
                                     edit = false,
                                 }) {
    const employees =
        await getEmployees({
            managerUserId,
        });


    const buttons = [
        [
            Markup.button.callback(
                "➕ Пригласить кассира",
                "employee_invite_create"
            ),
        ],
    ];


    for (
        const item
        of employees
        ) {
        const current =
            item.assignments.find(
                ({
                     assignment,
                 }) =>
                    assignment
                        .is_current
            );


        const suffix =
            current
                ? ` — ${current.location.name}`
                : "";


        buttons.push([
            Markup.button.callback(
                `👤 ${getEmployeeDisplayName(item.employee)}${suffix}`,
                `employee_manage:${item.employee.id}`
            ),
        ]);
    }


    const text = [
        "👥 Сотрудники Camp Card",
        "",
        employees.length
            ? `Активных сотрудников: ${employees.length}`
            : "Активных сотрудников пока нет.",
        "",
        "Выберите сотрудника для управления или создайте новое приглашение.",
    ].join("\n");


    if (edit) {
        return safeEditMessageText(
            ctx,
            text,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }


    return ctx.reply(
        text,
        Markup.inlineKeyboard(
            buttons
        )
    );
}


async function showEmployeeDetails({
                                       ctx,
                                       managerUserId,
                                       employeeUserId,
                                       edit = true,
                                   }) {
    const details =
        await getEmployeeDetails({
            managerUserId,
            employeeUserId,
        });


    const employee =
        details.employee;


    const username =
        employee.username
            ? `@${employee.username}`
            : "не указан";


    const locationLines =
        details.assignments.length
            ? details.assignments
                .map(
                    ({
                         assignment,
                         location,
                     }) =>
                        assignment
                            .is_current
                            ? `✅ ${location.name} — текущая`
                            : `• ${location.name}`
                )
                .join("\n")
            : "Нет назначенных точек";


    const buttons = [];


    if (
        details
            .availableLocations
            .length > 0
    ) {
        buttons.push([
            Markup.button.callback(
                "➕ Добавить точку",
                `employee_add_location_menu:${employee.id}`
            ),
        ]);
    }


    if (
        details
            .assignments
            .length > 1
    ) {
        buttons.push([
            Markup.button.callback(
                "➖ Убрать точку",
                `employee_remove_location_menu:${employee.id}`
            ),
        ]);
    }


    buttons.push([
        Markup.button.callback(
            "🚫 Отозвать доступ",
            `employee_revoke_confirm:${employee.id}`
        ),
    ]);


    buttons.push([
        Markup.button.callback(
            "⬅️ К сотрудникам",
            "employees_back"
        ),
    ]);


    const text = [
        "👤 Сотрудник Camp Card",
        "",
        `Имя: ${getEmployeeDisplayName(employee)}`,
        `Telegram: ${username}`,
        `User ID: ${employee.id}`,
        "",
        "Доступ к точкам:",
        locationLines,
    ].join("\n");


    if (edit) {
        return safeEditMessageText(
            ctx,
            text,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }


    return ctx.reply(
        text,
        Markup.inlineKeyboard(
            buttons
        )
    );
}

bot.start(async (ctx) => {
    try {
        const {
            user,
            wallet,
        } =
            await getOrCreateTelegramUser(
                ctx.from
            );

        const payload =
            ctx.startPayload ||
            "";

        const staffMatch =
            payload.match(
                /^staff_(.+)$/
            );


        if (staffMatch) {
            try {
                const result =
                    await acceptEmployeeInvite({
                        rawToken:
                            staffMatch[1],

                        userId:
                        user.id,
                    });


                const locationNames =
                    result.locations
                        .map(
                            location =>
                                `• ${location.name}`
                        )
                        .join("\n");


                await ctx.reply(
                    [
                        "✅ Вы добавлены как сотрудник Camp Card",
                        "",
                        "Доступные рабочие точки:",
                        locationNames,
                        "",
                        "Перед началом работы выберите текущую точку через кнопку «📍 Рабочая точка».",
                    ].join("\n"),

                    getMainKeyboard(
                        result.user
                    )
                );


                return;

            } catch (error) {
                console.error(
                    "Accept employee invite:",
                    error
                );


                const messages = {
                    INVITE_NOT_FOUND:
                        "❌ Приглашение не найдено.",

                    INVITE_ALREADY_USED:
                        "❌ Это приглашение уже было использовано.",

                    INVITE_NOT_ACTIVE:
                        "❌ Это приглашение больше не действует.",

                    INVITE_EXPIRED:
                        "⌛ Срок действия приглашения истёк.",

                    USER_BLOCKED:
                        "❌ Для этого аккаунта доступ заблокирован.",
                };


                await ctx.reply(
                    messages[
                        error.message
                        ] ||
                    "❌ Не удалось принять приглашение."
                );


                return;
            }
        }

        /*
 * Сотрудник сканирует
 * QR для пополнения.
 */
        const topupMatch =
            payload.match(
                /^topup_cash_(.+)$/
            );


        if (topupMatch) {

            const paymentMethod =
                "cash";

            const rawToken =
                topupMatch[1];

            try {

                const result =
                    await claimTopupQr({
                        rawToken,

                        employeeUserId:
                        user.id,
                    });


                const plans =
                    await getActivePlans();


                const buttons =
                    plans.map(
                        (plan) => {

                            const paid =
                                Number(
                                    plan
                                        .topup_amount_kopecks
                                );

                            const bonus =
                                Number(
                                    plan
                                        .bonus_amount_kopecks
                                );


                            return [
                                Markup.button.callback(
                                    `${plan.name}: ${formatKopecks(paid)} ₽ → ${formatKopecks(paid + bonus)} ₽`,

                                    `manual_topup_plan:${paymentMethod}:${result.qrToken.id}:${plan.code}`
                                ),
                            ];
                        }
                    );


                const methodText =
                    "наличными";


                await ctx.reply(
                    [
                        "💳 Пополнение Camp Card",
                        "",
                        `📍 ${result.location.name}`,
                        `Клиент: ${result.customer.first_name || "Клиент"}`,
                        "",
                        `Способ оплаты: ${methodText}`,
                        "",
                        "Выберите пакет:",
                    ].join("\n"),

                    Markup.inlineKeyboard(
                        buttons
                    )
                );


                return;

            } catch (error) {

                console.error(
                    "Claim topup QR:",
                    error
                );


                await ctx.reply(
                    "❌ Не удалось открыть пополнение."
                );


                return;
            }
        }

        /*
         * Сотрудник отсканировал
         * QR клиента.
         */

        if (
            payload.startsWith(
                "pay_"
            )
        ) {
            const rawToken =
                payload.substring(
                    4
                );

            try {
                const result =
                    await claimPaymentQr({
                        rawToken,

                        employeeUserId:
                        user.id,
                    });

                const customerName =
                    result.customer
                        ?.first_name ||
                    "Клиент";

                const totalBalance =
                    Number(
                        result.wallet
                            .paid_balance_kopecks ||
                        0
                    ) +
                    Number(
                        result.wallet
                            .bonus_balance_kopecks ||
                        0
                    );

                await ctx.reply(
                    [
                        "💳 Camp Card",
                        "",
                        `📍 Точка: ${result.location.name}`,
                        "",
                        `Клиент: ${customerName}`,
                        `Баланс: ${formatKopecks(totalBalance)} ₽`,
                        "",
                        "Введите сумму покупки в рублях.",
                        "",
                        "Например:",
                        "850",
                        "или",
                        "850,50",
                    ].join("\n")
                );

                return;

            } catch (error) {
                console.error(
                    "Claim QR:",
                    error
                );

                const messages = {
                    NOT_EMPLOYEE:
                        "❌ Этот аккаунт не зарегистрирован как сотрудник.",

                    EMPLOYEE_LOCATION_NOT_SET:
                        "❌ Для сотрудника не назначена рабочая точка.",

                    QR_NOT_FOUND:
                        "❌ QR-код недействителен.",

                    QR_ALREADY_USED:
                        "❌ Этот QR-код уже был использован или отсканирован.",

                    QR_EXPIRED:
                        "⌛ QR-код уже истёк.",
                };

                await ctx.reply(
                    messages[
                        error.message
                        ] ||
                    "❌ Не удалось открыть оплату."
                );

                return;
            }
        }

        /*
         * Обычный /start клиента.
         */

        const name =
            user.first_name ||
            "Добро пожаловать";

        await ctx.reply(
            `👋 ${name}!\n\n` +
            `Добро пожаловать в Camp Card.\n\n` +
            `Пополняйте баланс заранее, получайте бонусы и оплачивайте покупки в наших заведениях.`,
            getMainKeyboard(
                user
            )
        );

        const freshWallet =
            await getWalletForUser(
                user.id
            );

        await ctx.reply(
            buildWalletText(
                freshWallet ||
                wallet
            )
        );

    } catch (error) {
        console.error(
            "Ошибка /start:",
            error
        );

        await ctx.reply(
            "Произошла ошибка."
        );
    }
});

bot.hears(
    "💳 Моя Camp Card",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            const overview =
                await getCardOverview(
                    user.id
                );

            await ctx.reply(
                buildCardOverviewText(
                    overview
                ),

                buildCardActionsKeyboard()
            );

        } catch (error) {
            console.error(
                "Card overview:",
                error
            );

            await ctx.reply(
                "❌ Не удалось загрузить Camp Card."
            );
        }
    }
);

bot.action(
    "card_show_qr",
    async (ctx) => {
        try {
            await ctx.answerCbQuery();


            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const totalBalance =
                Number(
                    wallet
                        .paid_balance_kopecks ||
                    0
                ) +
                Number(
                    wallet
                        .bonus_balance_kopecks ||
                    0
                );


            if (
                totalBalance <= 0
            ) {
                await ctx.reply(
                    "На Camp Card недостаточно средств."
                );

                return;
            }


            const {
                qrBuffer,
            } =
                await createPaymentQr(
                    wallet.id
                );


            await ctx.replyWithPhoto(
                {
                    source:
                    qrBuffer,
                },
                {
                    caption: [
                        "📱 Camp Card",
                        "",
                        "Покажите этот QR сотруднику.",
                        "",
                        "QR одноразовый и действует ограниченное время.",
                        "",
                        `Баланс: ${formatKopecks(totalBalance)} ₽`,
                    ].join("\n"),
                }
            );

        } catch (error) {
            console.error(
                "Card QR:",
                error
            );

            await ctx.reply(
                "❌ Не удалось создать QR."
            );
        }
    }
);

bot.action(
    "sber_topup",
    async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const plans =
                await getActivePlans();


            const buttons =
                plans.map(
                    (plan) => {

                        const paid =
                            Number(
                                plan
                                    .topup_amount_kopecks
                            );

                        const bonus =
                            Number(
                                plan
                                    .bonus_amount_kopecks
                            );


                        return [
                            Markup.button.callback(
                                `${formatKopecks(paid)} ₽ → ${formatKopecks(paid + bonus)} ₽`,
                                `sber_plan:${plan.code}`
                            ),
                        ];
                    }
                );


            buttons.push([
                Markup.button.callback(
                    "⬅️ Назад",
                    "card_topup"
                ),
            ]);


            await safeEditMessageText(
                ctx,                [
                    "🏦 Онлайн-пополнение через Сбер",
                    "",
                    "Выберите пакет:",
                    "",
                    "После оплаты баланс Camp Card пополнится автоматически.",
                ].join("\n"),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "Sber menu:",
                error
            );
        }
    }
);

bot.action(
    /^sber_plan:(.+)$/,
    async (ctx) => {
        try {
            await ctx.answerCbQuery(
                "Создаём оплату..."
            );


            const planCode =
                ctx.match[1];


            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const result =
                await createSberTopup({
                    walletId:
                    wallet.id,

                    planCode,
                });


            const paid =
                Number(
                    result.plan
                        .topup_amount_kopecks
                );

            const bonus =
                Number(
                    result.plan
                        .bonus_amount_kopecks
                );


            await ctx.reply(
                [
                    "🏦 Пополнение через Сбер",
                    "",
                    `К оплате: ${formatKopecks(paid)} ₽`,
                    `Бонус: +${formatKopecks(bonus)} ₽`,
                    `На Camp Card поступит: ${formatKopecks(paid + bonus)} ₽`,
                    "",
                    "Нажмите кнопку ниже и завершите оплату на странице Сбера.",
                    "",
                    "После подтверждения банком баланс пополнится автоматически.",
                ].join("\n"),

                Markup.inlineKeyboard([
                    [
                        Markup.button.url(
                            `Оплатить ${formatKopecks(paid)} ₽`,
                            result.paymentUrl
                        ),
                    ],
                ])
            );

        } catch (error) {
            console.error(
                "Create Sber topup:",
                error
            );

            await ctx.reply(
                "❌ Не удалось создать оплату через Сбер."
            );
        }
    }
);

bot.action(
    "card_topup",
    async (ctx) => {
        try {
            await ctx.answerCbQuery();

            await safeEditMessageText(
                ctx,
                [
                    "💰 Пополнение Camp Card",
                    "",
                    "Выберите способ пополнения:",
                ].join("\n"),

                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "💵 Наличными в кафе",
                            "topup_cash_qr"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "🏦 Онлайн через Сбер",
                            "sber_topup"
                        ),
                    ],
                    [
                        Markup.button.callback(
                            "⬅️ Назад к Camp Card",
                            "card_back"
                        ),
                    ],
                ])
            );

        } catch (error) {
            console.error(
                "Card topup menu:",
                error
            );
        }
    }
);

bot.action(
    "card_back",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            const overview =
                await getCardOverview(
                    user.id
                );

            await ctx.answerCbQuery();

            await safeEditMessageText(
                ctx,
                buildCardOverviewText(
                    overview
                ),

                buildCardActionsKeyboard()
            );

        } catch (error) {
            console.error(
                "Card back:",
                error
            );

            await ctx
                .answerCbQuery(
                    "Не удалось открыть Camp Card"
                )
                .catch(() => {});
        }
    }
);

bot.action(
    "card_history",
    async (ctx) => {
        try {
            await ctx.answerCbQuery();


            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const history =
                await getWalletHistory({
                    walletId:
                    wallet.id,

                    limit:
                        8,
                });


            const buttons = [];

            if (
                history.hasMore &&
                history.nextBeforeId
            ) {
                buttons.push([
                    Markup.button.callback(
                        "⬅️ Более ранние",
                        `history_older:${history.nextBeforeId}`
                    ),
                ]);
            }


            await ctx.reply(
                buildHistoryText(
                    history.items
                ),

                buttons.length
                    ? Markup.inlineKeyboard(
                        buttons
                    )
                    : undefined
            );

        } catch (error) {
            console.error(
                "Card history:",
                error
            );
        }
    }
);

bot.hears(
    "📱 Показать QR",
    async (ctx) => {
        try {
            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            const totalBalance =
                Number(
                    wallet.paid_balance_kopecks ||
                    0
                ) +
                Number(
                    wallet.bonus_balance_kopecks ||
                    0
                );

            if (totalBalance <= 0) {
                await ctx.reply(
                    "На Camp Card недостаточно средств."
                );

                return;
            }

            const {
                qrBuffer,
                expiresAt,
            } =
                await createPaymentQr(
                    wallet.id
                );

            await ctx.replyWithPhoto(
                {
                    source: qrBuffer,
                },
                {
                    caption: [
                        "📱 Camp Card",
                        "",
                        "Покажите этот QR сотруднику.",
                        "",
                        "QR одноразовый и действует ограниченное время.",
                        "",
                        `Баланс: ${formatKopecks(totalBalance)} ₽`,
                    ].join("\n"),
                }
            );

        } catch (error) {
            console.error(
                "QR error:",
                error
            );

            await ctx.reply(
                "Не удалось создать QR."
            );
        }
    }
);

bot.hears(
    "👥 Сотрудники",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            if (
                ![
                    "owner",
                    "admin",
                ].includes(
                    user.role
                )
            ) {
                return;
            }


            await showEmployeesMenu({
                ctx,

                managerUserId:
                user.id,

                edit:
                    false,
            });

        } catch (error) {
            console.error(
                "Employees menu:",
                error
            );

            await ctx.reply(
                "❌ Не удалось загрузить сотрудников."
            );
        }
    }
);

bot.action(
    "employee_invite_create",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            if (
                ![
                    "owner",
                    "admin",
                ].includes(
                    user.role
                )
            ) {
                await ctx.answerCbQuery(
                    "Нет доступа"
                );

                return;
            }


            const locations =
                await getActiveLocations();


            const buttons =
                locations.map(
                    location => [
                        Markup.button.callback(
                            `📍 ${location.name}`,
                            `employee_invite_location:${location.id}`
                        ),
                    ]
                );


            if (
                locations.length > 1
            ) {
                buttons.push([
                    Markup.button.callback(
                        "🏪 Все точки",
                        "employee_invite_all"
                    ),
                ]);
            }


            await ctx.answerCbQuery();


            await safeEditMessageText(
                ctx,

                [
                    "➕ Приглашение кассира",
                    "",
                    "Выберите, к каким точкам сотрудник получит доступ.",
                ].join("\n"),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "Employee invite menu:",
                error
            );
        }
    }
);


bot.action(
    /^employee_invite_location:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const result =
                await createEmployeeInvite({
                    createdByUserId:
                    user.id,

                    locationIds: [
                        Number(
                            ctx.match[1]
                        ),
                    ],
                });


            await ctx.answerCbQuery(
                "Приглашение создано"
            );


            await ctx.reply(
                [
                    "✅ Приглашение кассира создано",
                    "",
                    `Точка: ${result.locations[0].name}`,
                    "",
                    "Отправьте сотруднику эту ссылку:",
                    "",
                    result.deepLink,
                    "",
                    "Ссылка одноразовая и действует 24 часа.",
                ].join("\n"),

                Markup.inlineKeyboard([
                    [
                        Markup.button.url(
                            "🔗 Открыть приглашение",
                            result.deepLink
                        ),
                    ],
                ])
            );

        } catch (error) {
            console.error(
                "Create employee invite:",
                error
            );

            await ctx.reply(
                "❌ Не удалось создать приглашение."
            );
        }
    }
);


bot.action(
    "employee_invite_all",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const locations =
                await getActiveLocations();


            const result =
                await createEmployeeInvite({
                    createdByUserId:
                    user.id,

                    locationIds:
                        locations.map(
                            location =>
                                Number(
                                    location.id
                                )
                        ),
                });


            await ctx.answerCbQuery(
                "Приглашение создано"
            );


            const names =
                result.locations
                    .map(
                        location =>
                            `• ${location.name}`
                    )
                    .join("\n");


            await ctx.reply(
                [
                    "✅ Приглашение кассира создано",
                    "",
                    "Доступные точки:",
                    names,
                    "",
                    "Отправьте сотруднику эту ссылку:",
                    "",
                    result.deepLink,
                    "",
                    "Ссылка одноразовая и действует 24 часа.",
                ].join("\n"),

                Markup.inlineKeyboard([
                    [
                        Markup.button.url(
                            "🔗 Открыть приглашение",
                            result.deepLink
                        ),
                    ],
                ])
            );

        } catch (error) {
            console.error(
                "Create all-locations invite:",
                error
            );

            await ctx.reply(
                "❌ Не удалось создать приглашение."
            );
        }
    }
);

bot.action(
    "employees_back",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            await ctx.answerCbQuery();


            await showEmployeesMenu({
                ctx,

                managerUserId:
                user.id,

                edit:
                    true,
            });

        } catch (error) {
            console.error(
                "Employees back:",
                error
            );
        }
    }
);


bot.action(
    /^employee_manage:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );


            await ctx.answerCbQuery();


            await showEmployeeDetails({
                ctx,

                managerUserId:
                user.id,

                employeeUserId,

                edit:
                    true,
            });

        } catch (error) {
            console.error(
                "Employee manage:",
                error
            );

            await ctx
                .answerCbQuery(
                    "Не удалось открыть сотрудника"
                )
                .catch(() => {});
        }
    }
);


bot.action(
    /^employee_add_location_menu:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );


            const details =
                await getEmployeeDetails({
                    managerUserId:
                    user.id,

                    employeeUserId,
                });


            const buttons =
                details
                    .availableLocations
                    .map(
                        location => [
                            Markup.button.callback(
                                `➕ ${location.name}`,
                                `employee_add_location:${employeeUserId}:${location.id}`
                            ),
                        ]
                    );


            buttons.push([
                Markup.button.callback(
                    "⬅️ Назад",
                    `employee_manage:${employeeUserId}`
                ),
            ]);


            await ctx.answerCbQuery();


            await safeEditMessageText(
                ctx,

                [
                    "➕ Добавить рабочую точку",
                    "",
                    `Сотрудник: ${getEmployeeDisplayName(details.employee)}`,
                    "",
                    "Выберите точку:",
                ].join("\n"),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "Employee add location menu:",
                error
            );
        }
    }
);


bot.action(
    /^employee_add_location:(\d+):(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );

            const locationId =
                Number(
                    ctx.match[2]
                );


            const result =
                await addEmployeeLocation({
                    managerUserId:
                    user.id,

                    employeeUserId,

                    locationId,
                });


            await ctx.answerCbQuery(
                `Добавлена: ${result.location.name}`
            );


            try {
                await ctx.telegram.sendMessage(
                    String(
                        result.employee
                            .telegram_id
                    ),

                    [
                        "✅ Вам добавлена рабочая точка Camp Card.",
                        "",
                        `📍 ${result.location.name}`,
                        "",
                        "Вы можете выбрать её через кнопку «📍 Рабочая точка».",
                    ].join("\n")
                );
            } catch (notifyError) {
                console.error(
                    "Employee add location notify:",
                    notifyError
                );
            }


            await showEmployeeDetails({
                ctx,

                managerUserId:
                user.id,

                employeeUserId,

                edit:
                    true,
            });

        } catch (error) {
            console.error(
                "Employee add location:",
                error
            );

            await ctx
                .answerCbQuery(
                    "Не удалось добавить точку"
                )
                .catch(() => {});
        }
    }
);


bot.action(
    /^employee_remove_location_menu:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );


            const details =
                await getEmployeeDetails({
                    managerUserId:
                    user.id,

                    employeeUserId,
                });


            if (
                details.assignments.length <=
                1
            ) {
                await ctx.answerCbQuery(
                    "Последнюю точку можно убрать только через отзыв доступа."
                );

                return;
            }


            const buttons =
                details.assignments.map(
                    ({
                         assignment,
                         location,
                     }) => [
                        Markup.button.callback(
                            `${assignment.is_current ? "✅ " : ""}➖ ${location.name}`,
                            `employee_remove_location:${employeeUserId}:${location.id}`
                        ),
                    ]
                );


            buttons.push([
                Markup.button.callback(
                    "⬅️ Назад",
                    `employee_manage:${employeeUserId}`
                ),
            ]);


            await ctx.answerCbQuery();


            await safeEditMessageText(
                ctx,

                [
                    "➖ Убрать рабочую точку",
                    "",
                    `Сотрудник: ${getEmployeeDisplayName(details.employee)}`,
                    "",
                    "Выберите точку, доступ к которой нужно убрать:",
                ].join("\n"),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "Employee remove location menu:",
                error
            );
        }
    }
);


bot.action(
    /^employee_remove_location:(\d+):(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );

            const locationId =
                Number(
                    ctx.match[2]
                );


            const result =
                await removeEmployeeLocation({
                    managerUserId:
                    user.id,

                    employeeUserId,

                    locationId,
                });


            await ctx.answerCbQuery(
                `Убрана: ${result.location.name}`
            );


            try {
                const lines = [
                    "⚠️ Изменён доступ Camp Card.",
                    "",
                    `Убрана рабочая точка: ${result.location.name}`,
                ];


                if (
                    result.newCurrentLocation
                ) {
                    lines.push(
                        "",
                        `Текущая точка автоматически изменена на: ${result.newCurrentLocation.name}`
                    );
                }


                await ctx.telegram.sendMessage(
                    String(
                        result.employee
                            .telegram_id
                    ),

                    lines.join("\n")
                );

            } catch (notifyError) {
                console.error(
                    "Employee remove location notify:",
                    notifyError
                );
            }


            await showEmployeeDetails({
                ctx,

                managerUserId:
                user.id,

                employeeUserId,

                edit:
                    true,
            });

        } catch (error) {
            console.error(
                "Employee remove location:",
                error
            );


            const messages = {
                EMPLOYEE_LAST_LOCATION:
                    "Последнюю точку нельзя убрать. Используйте «Отозвать доступ».",

                EMPLOYEE_LOCATION_NOT_FOUND:
                    "Эта точка сотруднику не назначена.",
            };


            await ctx
                .answerCbQuery(
                    messages[
                        error.message
                        ] ||
                    "Не удалось убрать точку"
                )
                .catch(() => {});
        }
    }
);


bot.action(
    /^employee_revoke_confirm:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );


            const details =
                await getEmployeeDetails({
                    managerUserId:
                    user.id,

                    employeeUserId,
                });


            await ctx.answerCbQuery();


            await safeEditMessageText(
                ctx,

                [
                    "🚫 Отозвать доступ сотрудника?",
                    "",
                    `Сотрудник: ${getEmployeeDisplayName(details.employee)}`,
                    "",
                    "Будут отключены все рабочие точки.",
                    "Сотрудник больше не сможет принимать оплату или пополнять Camp Card.",
                    "",
                    "Его обычная клиентская Camp Card останется доступна.",
                ].join("\n"),

                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "🚫 Да, отозвать доступ",
                            `employee_revoke:${employeeUserId}`
                        ),
                    ],

                    [
                        Markup.button.callback(
                            "⬅️ Отмена",
                            `employee_manage:${employeeUserId}`
                        ),
                    ],
                ])
            );

        } catch (error) {
            console.error(
                "Employee revoke confirm:",
                error
            );
        }
    }
);


bot.action(
    /^employee_revoke:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const employeeUserId =
                Number(
                    ctx.match[1]
                );


            const result =
                await revokeEmployeeAccess({
                    managerUserId:
                    user.id,

                    employeeUserId,
                });


            await ctx.answerCbQuery(
                "Доступ отозван"
            );


            try {
                await ctx.telegram.sendMessage(
                    String(
                        result.employee
                            .telegram_id
                    ),

                    [
                        "🚫 Доступ сотрудника Camp Card отозван.",
                        "",
                        "Вы больше не можете проводить операции как кассир.",
                        "",
                        "Ваша личная Camp Card продолжает работать как обычно.",
                    ].join("\n"),

                    customerKeyboard
                );
            } catch (notifyError) {
                console.error(
                    "Employee revoke notify:",
                    notifyError
                );
            }


            await showEmployeesMenu({
                ctx,

                managerUserId:
                user.id,

                edit:
                    true,
            });

        } catch (error) {
            console.error(
                "Employee revoke:",
                error
            );

            await ctx
                .answerCbQuery(
                    "Не удалось отозвать доступ"
                )
                .catch(() => {});
        }
    }
);

bot.hears(
    "📍 Рабочая точка",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            if (
                ![
                    "employee",
                    "admin",
                    "owner",
                ].includes(
                    user.role
                )
            ) {
                await ctx.reply(
                    "❌ У вас нет доступа к рабочим точкам."
                );

                return;
            }


            const assignments =
                await getEmployeeLocations({
                    userId:
                    user.id,
                });


            if (
                assignments.length ===
                0
            ) {
                await ctx.reply(
                    "❌ Вам пока не назначена ни одна рабочая точка."
                );

                return;
            }


            const buttons =
                assignments.map(
                    ({
                         assignment,
                         location,
                     }) => {

                        const prefix =
                            assignment
                                .is_current
                                ? "✅"
                                : "▫️";


                        return [
                            Markup.button.callback(
                                `${prefix} ${location.name}`,
                                `employee_location:${location.id}`
                            ),
                        ];
                    }
                );


            const current =
                assignments.find(
                    ({
                         assignment,
                     }) =>
                        assignment
                            .is_current
                );


            await ctx.reply(
                [
                    "📍 Рабочая точка",
                    "",
                    current
                        ? `Сейчас вы работаете: ${current.location.name}`
                        : "Текущая точка не выбрана.",
                    "",
                    "Выберите точку, на которой вы сейчас работаете:",
                ].join("\n"),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "Employee location menu:",
                error
            );

            await ctx.reply(
                "❌ Не удалось загрузить рабочие точки."
            );
        }
    }
);

bot.action(
    /^employee_location:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            if (
                ![
                    "employee",
                    "admin",
                    "owner",
                ].includes(
                    user.role
                )
            ) {
                await ctx.answerCbQuery(
                    "Нет доступа"
                );

                return;
            }


            const locationId =
                Number(
                    ctx.match[1]
                );


            const result =
                await setCurrentEmployeeLocation({
                    userId:
                    user.id,

                    locationId,
                });


            await ctx.answerCbQuery(
                `Точка: ${result.location.name}`
            );


            const assignments =
                await getEmployeeLocations({
                    userId:
                    user.id,
                });


            const buttons =
                assignments.map(
                    ({
                         assignment,
                         location,
                     }) => {

                        const prefix =
                            assignment
                                .is_current
                                ? "✅"
                                : "▫️";


                        return [
                            Markup.button.callback(
                                `${prefix} ${location.name}`,
                                `employee_location:${location.id}`
                            ),
                        ];
                    }
                );


            await safeEditMessageText(
                ctx,

                [
                    "📍 Рабочая точка",
                    "",
                    `Сейчас вы работаете: ${result.location.name}`,
                    "",
                    "Все операции Camp Card будут записываться на эту точку.",
                ].join("\n"),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "Set employee location:",
                error
            );


            const messages = {
                EMPLOYEE_LOCATION_NOT_ASSIGNED:
                    "❌ Эта точка вам не назначена.",

                LOCATION_NOT_FOUND:
                    "❌ Рабочая точка не найдена.",
            };


            await ctx
                .answerCbQuery(
                    messages[
                        error.message
                        ] ||
                    "Не удалось переключить точку"
                )
                .catch(() => {});
        }
    }
);

bot.command(
    "dev_location",
    async (ctx) => {
        try {
            const ownerId =
                String(
                    process.env
                        .TELEGRAM_OWNER_ID ||
                    ""
                );

            if (
                String(ctx.from.id) !==
                ownerId
            ) {
                return;
            }

            const parts =
                ctx.message.text
                    .trim()
                    .split(/\s+/);

            const locationCode =
                parts[1];

            if (!locationCode) {
                await ctx.reply(
                    [
                        "Например:",
                        "",
                        "/dev_location adalet",
                        "",
                        "или",
                        "",
                        "/dev_location balaklavskaya",
                    ].join("\n")
                );

                return;
            }

            const location =
                await getLocationByCode(
                    locationCode
                );

            if (!location) {
                await ctx.reply(
                    "Точка не найдена."
                );

                return;
            }

            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            await user.update({
                role: "owner",
            });

            let assignment =
                await EmployeeLocation.findOne({
                    where: {
                        user_id:
                        user.id,

                        location_id:
                        location.id,
                    },
                });


            if (assignment) {
                await assignment.update({
                    is_active:
                        true,
                });
            } else {
                assignment =
                    await EmployeeLocation.create({
                        user_id:
                        user.id,

                        location_id:
                        location.id,

                        is_active:
                            true,

                        is_current:
                            false,
                    });
            }


            await setCurrentEmployeeLocation({
                userId:
                user.id,

                locationId:
                location.id,
            });

            await ctx.reply(
                `✅ Рабочая точка: ${location.name}`
            );

        } catch (error) {
            console.error(
                "dev_location:",
                error
            );

            await ctx.reply(
                "Ошибка назначения точки."
            );
        }
    }
);

bot.action(
    "topup_cash_qr",
    async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const {
                qrBuffer,
            } =
                await createTopupQr(
                    wallet.id
                );


            await ctx.replyWithPhoto(
                {
                    source:
                    qrBuffer,
                },
                {
                    caption: [
                        "💵 Пополнение Camp Card наличными",
                        "",
                        "Покажите этот QR сотруднику кафе.",
                        "",
                        "Сотрудник отсканирует QR, выберет пакет и подтвердит получение наличных.",
                        "",
                        "QR одноразовый и действует ограниченное время.",
                    ].join("\n"),
                }
            );

        } catch (error) {
            console.error(
                "Create topup QR:",
                error
            );

            await ctx.reply(
                "❌ Не удалось создать QR для пополнения."
            );
        }
    }
);

bot.action(
    /^manual_topup_plan:cash:(\d+):(.+)$/,
    async (ctx) => {
        try {

            const paymentMethod =
                "cash";

            const qrTokenId =
                ctx.match[1];

            const planCode =
                ctx.match[2];


            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const result =
                await prepareManualTopup({
                    qrTokenId,

                    employeeUserId:
                    user.id,

                    planCode,

                    paymentMethod,
                });


            await ctx.answerCbQuery();


            const paid =
                Number(
                    result.plan
                        .topup_amount_kopecks
                );

            const bonus =
                Number(
                    result.plan
                        .bonus_amount_kopecks
                );

            await ctx.reply(
                [
                    "💵 Наличное пополнение",
                    "",
                    `📍 ${result.location.name}`,
                    `Клиент: ${result.customer.first_name || "Клиент"}`,
                    "",
                    `Получить наличными: ${formatKopecks(paid)} ₽`,
                    `Бонус: +${formatKopecks(bonus)} ₽`,
                    `На Camp Card: ${formatKopecks(paid + bonus)} ₽`,
                    "",
                    "Подтвердите только после получения денег.",
                ].join("\n"),

                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            "✅ Деньги получены",
                            `manual_topup_confirm:${result.topup.id}`
                        ),
                    ],

                    [
                        Markup.button.callback(
                            "❌ Отмена",
                            `manual_topup_cancel:${result.topup.id}`
                        ),
                    ],
                ])
            );

        } catch (error) {

            console.error(
                "Prepare manual topup:",
                error
            );

            await ctx.reply(
                "❌ Не удалось подготовить пополнение."
            );
        }
    }
);

bot.action(
    /^manual_topup_confirm:(\d+)$/,
    async (ctx) => {
        try {

            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const result =
                await completeManualTopup({
                    topupPaymentId:
                        ctx.match[1],

                    employeeUserId:
                    user.id,
                });


            await ctx.answerCbQuery(
                "Пополнение выполнено"
            );


            const paid =
                Number(
                    result.topup
                        .paid_amount_kopecks
                );

            const bonus =
                Number(
                    result.topup
                        .bonus_amount_kopecks
                );


            const methodText =
                result.topup
                    .payment_method ===
                "sbp"
                    ? "СБП"
                    : "Наличные";


            await ctx.reply(
                [
                    "✅ Camp Card пополнена",
                    "",
                    `Способ: ${methodText}`,
                    `Оплачено: ${formatKopecks(paid)} ₽`,
                    `Бонус: +${formatKopecks(bonus)} ₽`,
                ].join("\n")
            );


            try {

                await ctx.telegram.sendMessage(
                    String(
                        result.customer
                            .telegram_id
                    ),

                    [
                        "✅ Ваша Camp Card пополнена",
                        "",
                        `Пополнение: ${formatKopecks(paid)} ₽`,
                        `Бонус: +${formatKopecks(bonus)} ₽`,
                        "",
                        buildWalletText(
                            result.wallet
                        ),
                    ].join("\n")
                );

            } catch (error) {

                console.error(
                    "Topup customer notification:",
                    error
                );
            }

        } catch (error) {

            console.error(
                "Complete manual topup:",
                error
            );

            await ctx.reply(
                "❌ Не удалось выполнить пополнение."
            );
        }
    }
);

bot.action(
    /^manual_topup_cancel:(\d+)$/,
    async (ctx) => {
        try {

            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            await cancelManualTopup({
                topupPaymentId:
                    ctx.match[1],

                employeeUserId:
                user.id,
            });


            await ctx.answerCbQuery(
                "Пополнение отменено"
            );


            await ctx.reply(
                "❌ Пополнение отменено."
            );

        } catch (error) {

            console.error(
                "Cancel manual topup:",
                error
            );
        }
    }
);

bot.hears(
    "🎁 Пакеты",
    async (ctx) => {
        try {
            const plans =
                await getActivePlans();

            if (!plans.length) {
                await ctx.reply(
                    "Сейчас нет доступных пакетов."
                );

                return;
            }

            const buttons =
                plans.map(
                    (plan) => {

                        const paid =
                            Number(
                                plan.topup_amount_kopecks
                            );

                        const bonus =
                            Number(
                                plan.bonus_amount_kopecks
                            );

                        const total =
                            paid +
                            bonus;

                        return [
                            Markup.button.callback(
                                `${plan.name} — ${formatKopecks(total)} ₽`,
                                `plan:${plan.code}`
                            ),
                        ];
                    }
                );

            await ctx.reply(
                [
                    "🎁 Пакеты Camp Card",
                    "",
                    "Выберите сумму пополнения:",
                ].join("\n"),
                Markup.inlineKeyboard(
                    buttons
                )
            );
        } catch (error) {
            console.error(
                "Ошибка списка пакетов:",
                error
            );

            await ctx.reply(
                "Не удалось загрузить пакеты."
            );
        }
    }
);

bot.action(
    /^plan:(.+)$/,
    async (ctx) => {
        try {
            const code =
                ctx.match[1];

            const plan =
                await getPlanByCode(
                    code
                );

            if (!plan) {
                await ctx.answerCbQuery(
                    "Пакет недоступен"
                );

                return;
            }

            await ctx.answerCbQuery();

            const paid =
                Number(
                    plan.topup_amount_kopecks
                );

            const bonus =
                Number(
                    plan.bonus_amount_kopecks
                );

            const total =
                paid + bonus;

            await ctx.reply(
                [
                    `💳 ${plan.name}`,
                    "",
                    `Вы оплачиваете: ${formatKopecks(paid)} ₽`,
                    `Бонус Camp Card: +${formatKopecks(bonus)} ₽`,
                    "",
                    `На баланс поступит: ${formatKopecks(total)} ₽`,
                    "",
                    `Срок бонуса: ${plan.bonus_valid_days} дней`,
                    "",
                    "На следующем этапе здесь будет кнопка оплаты.",
                ].join("\n")
            );

        } catch (error) {
            console.error(
                "Ошибка выбора пакета:",
                error
            );

            await ctx.reply(
                "Не удалось открыть пакет."
            );
        }
    }
);

bot.command(
    "dev_topup",
    async (ctx) => {
        try {
            const ownerId =
                String(
                    process.env
                        .TELEGRAM_OWNER_ID ||
                    ""
                );

            if (
                String(ctx.from.id) !==
                ownerId
            ) {
                return;
            }

            const parts =
                ctx.message.text
                    .trim()
                    .split(/\s+/);

            const planCode =
                parts[1];

            if (!planCode) {
                await ctx.reply(
                    [
                        "Использование:",
                        "",
                        "/dev_topup camp_month",
                    ].join("\n")
                );

                return;
            }

            const plan =
                await getPlanByCode(
                    planCode
                );

            if (!plan) {
                await ctx.reply(
                    "Пакет не найден."
                );

                return;
            }

            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            const result =
                await creditPlan({
                    walletId:
                    wallet.id,

                    plan,

                    externalRef:
                        `dev_${Date.now()}`,
                });

            await ctx.reply(
                [
                    "✅ Тестовое пополнение выполнено",
                    "",
                    `Оплачено: ${formatKopecks(result.paidAmount)} ₽`,
                    `Бонус: ${formatKopecks(result.bonusAmount)} ₽`,
                    `Зачислено: ${formatKopecks(result.totalCredited)} ₽`,
                    "",
                    buildWalletText(
                        result.wallet
                    ),
                ].join("\n")
            );

        } catch (error) {
            console.error(
                "dev_topup error:",
                error
            );

            await ctx.reply(
                "Ошибка тестового пополнения."
            );
        }
    }
);

bot.action(
    /^history_older:(\d+)$/,
    async (ctx) => {
        try {
            const beforeId =
                Number(
                    ctx.match[1]
                );


            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const history =
                await getWalletHistory({
                    walletId:
                    wallet.id,

                    beforeId,

                    limit:
                        8,
                });


            const buttons = [];

            if (
                history.hasMore &&
                history.nextBeforeId
            ) {
                buttons.push([
                    Markup.button.callback(
                        "⬅️ Ещё раньше",
                        `history_older:${history.nextBeforeId}`
                    ),
                ]);
            }

            buttons.push([
                Markup.button.callback(
                    "🕘 К последним операциям",
                    "history_latest"
                ),
            ]);


            await ctx.answerCbQuery();


            await ctx.editMessageText(
                buildHistoryText(
                    history.items
                ),

                Markup.inlineKeyboard(
                    buttons
                )
            );

        } catch (error) {
            console.error(
                "History older:",
                error
            );

            await ctx
                .answerCbQuery(
                    "Не удалось загрузить историю"
                )
                .catch(
                    () => {}
                );
        }
    }
);

bot.action(
    "history_latest",
    async (ctx) => {
        try {
            const {
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );


            const history =
                await getWalletHistory({
                    walletId:
                    wallet.id,

                    limit:
                        8,
                });


            const buttons = [];

            if (
                history.hasMore &&
                history.nextBeforeId
            ) {
                buttons.push([
                    Markup.button.callback(
                        "⬅️ Более ранние",
                        `history_older:${history.nextBeforeId}`
                    ),
                ]);
            }


            await ctx.answerCbQuery();


            await ctx.editMessageText(
                buildHistoryText(
                    history.items
                ),

                buttons.length
                    ? Markup.inlineKeyboard(
                        buttons
                    )
                    : undefined
            );

        } catch (error) {
            console.error(
                "History latest:",
                error
            );
        }
    }
);

bot.hears(
    "ℹ️ Помощь",
    async (ctx) => {
        await ctx.reply(
            [
                "Camp Card — ваш предоплаченный баланс.",
                "",
                "Вы пополняете Camp Card, получаете бонус и оплачиваете покупки в наших заведениях.",
                "",
                "Оплаченные вами средства не сгорают.",
            ].join("\n")
        );
    }
);

bot.action(
    /^charge_confirm:(\d+)$/,
    async (ctx) => {
        try {
            await ctx.answerCbQuery();

            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            const pendingChargeId =
                Number(
                    ctx.match[1]
                );

            const result =
                await completePendingCharge({
                    pendingChargeId,

                    employeeUserId:
                    user.id,
                });

            /*
 * Camp Card уже оплачен.
 *
 * Теперь автоматически фиксируем
 * продажу в BusinessCashBot.
 *
 * Если BusinessCash временно недоступен,
 * сам платёж НЕ отменяется.
 * Worker позже повторит отправку.
 */
            try {
                await syncRedemptionToBusinessCash(
                    result.redemption.id
                );
            } catch (syncError) {
                console.error(
                    "BusinessCash sync delayed:",
                    syncError.message
                );
            }

            await ctx.editMessageText(
                [
                    "✅ Camp Card",
                    "",
                    `📍 ${result.location.name}`,
                    "",
                    `Оплачено: ${formatKopecks(result.amountKopecks)} ₽`,
                    "",
                    `С баланса клиента: ${formatKopecks(result.paidSpentKopecks)} ₽`,
                    `Бонусами: ${formatKopecks(result.bonusSpentKopecks)} ₽`,
                    "",
                    `Остаток Camp Card: ${formatKopecks(result.totalBalanceKopecks)} ₽`,
                ].join("\n")
            );

            /*
             * Уведомляем клиента.
             */

            if (
                result.customer
                    ?.telegram_id
            ) {
                try {
                    await bot.telegram.sendMessage(
                        String(
                            result.customer
                                .telegram_id
                        ),

                        [
                            "✅ Оплата Camp Card",
                            "",
                            `📍 ${result.location.name}`,
                            "",
                            `Списано: ${formatKopecks(result.amountKopecks)} ₽`,
                            "",
                            `Остаток: ${formatKopecks(result.totalBalanceKopecks)} ₽`,
                        ].join("\n")
                    );

                } catch (
                    notifyError
                    ) {
                    console.error(
                        "Customer notification:",
                        notifyError
                    );
                }
            }

            /*
 * Планируем просьбу оставить
 * отзыв после посещения.
 *
 * Ошибка этого механизма
 * никак не влияет на оплату.
 */
            if (
                result.customer?.id &&
                result.location?.id &&
                result.redemption?.id
            ) {
                try {
                    const reviewResult =
                        await scheduleReviewRequest({
                            userId:
                            result.customer.id,

                            locationId:
                            result.location.id,

                            redemptionId:
                            result.redemption.id,
                        });


                    if (
                        reviewResult.scheduled
                    ) {
                        console.log(
                            `[ReviewRequest] scheduled redemption=${result.redemption.id}`
                        );
                    }

                } catch (
                    reviewError
                    ) {
                    console.error(
                        "Review request schedule:",
                        reviewError
                    );
                }
            }

        } catch (error) {
            console.error(
                "Confirm charge:",
                error
            );

            const messages = {
                INSUFFICIENT_FUNDS:
                    "❌ На Camp Card недостаточно средств.",

                PENDING_EXPIRED:
                    "⌛ Время подтверждения истекло.",

                PENDING_NOT_FOUND:
                    "❌ Эта операция уже завершена или отменена.",

                QR_INVALID:
                    "❌ QR-код больше недействителен.",

                LOCATION_CHANGED:
                    "❌ Рабочая точка сотрудника изменилась.",
            };

            await ctx.reply(
                messages[
                    error.message
                    ] ||
                "❌ Не удалось провести оплату."
            );
        }
    }
);

bot.action(
    /^charge_cancel:(\d+)$/,
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            await cancelPendingCharge({
                pendingChargeId:
                    Number(
                        ctx.match[1]
                    ),

                employeeUserId:
                user.id,
            });

            await ctx.answerCbQuery(
                "Отменено"
            );

            await ctx.editMessageText(
                "❌ Оплата Camp Card отменена."
            );

        } catch (error) {
            console.error(
                "Cancel charge:",
                error
            );

            await ctx.answerCbQuery(
                "Ошибка"
            );
        }
    }
);

bot.on(
    "text",
    async (ctx) => {
        try {
            const {
                user,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            const pending =
                await getActivePendingCharge(
                    user.id
                );

            /*
             * Если сотрудник сейчас
             * ничего не списывает —
             * обычный текст игнорируем.
             */

            if (!pending) {
                return;
            }

            const amountKopecks =
                parseRublesToKopecks(
                    ctx.message.text
                );

            if (!amountKopecks) {
                await ctx.reply(
                    [
                        "Введите сумму цифрами.",
                        "",
                        "Например:",
                        "850",
                        "или",
                        "850,50",
                    ].join("\n")
                );

                return;
            }

            try {
                const result =
                    await setPendingChargeAmount({
                        pendingChargeId:
                        pending.id,

                        employeeUserId:
                        user.id,

                        amountKopecks,
                    });

                await ctx.reply(
                    [
                        "💳 Camp Card",
                        "",
                        `📍 ${result.location.name}`,
                        "",
                        `Сумма: ${formatKopecks(amountKopecks)} ₽`,
                        "",
                        "Подтвердить списание?",
                    ].join("\n"),

                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                `✅ Списать ${formatKopecks(amountKopecks)} ₽`,
                                `charge_confirm:${pending.id}`
                            ),
                        ],

                        [
                            Markup.button.callback(
                                "❌ Отмена",
                                `charge_cancel:${pending.id}`
                            ),
                        ],
                    ])
                );

            } catch (error) {
                if (
                    error.message ===
                    "INSUFFICIENT_FUNDS"
                ) {
                    await ctx.reply(
                        "❌ На Camp Card клиента недостаточно средств."
                    );

                    return;
                }

                throw error;
            }

        } catch (error) {
            console.error(
                "Pending amount error:",
                error
            );

            await ctx.reply(
                "Не удалось подготовить списание."
            );
        }
    }
);

bot.catch((error, ctx) => {
    console.error(
        `Telegram bot error (${ctx.updateType}):`,
        error
    );
});

module.exports = bot;