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
        "💰 Пополнить",
        "📜 История",
    ],
    [
        "🎁 Пакеты",
        "ℹ️ Помощь",
    ],

])
    .resize()
    .persistent();

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
            customerKeyboard
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
                wallet,
            } =
                await getOrCreateTelegramUser(
                    ctx.from
                );

            await ctx.reply(
                buildWalletText(wallet)
            );
        } catch (error) {
            console.error(
                "Ошибка показа Camp Card:",
                error
            );

            await ctx.reply(
                "Не удалось загрузить баланс."
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

            const existing =
                await EmployeeLocation.findOne({
                    where: {
                        user_id: user.id,
                    },
                });

            if (existing) {
                await existing.update({
                    location_id:
                    location.id,

                    is_active:
                        true,
                });
            } else {
                await EmployeeLocation.create({
                    user_id:
                    user.id,

                    location_id:
                    location.id,

                    is_active:
                        true,
                });
            }

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

bot.hears(
    "💰 Пополнить",
    async (ctx) => {
        await ctx.reply(
            "💰 Здесь скоро появятся варианты пополнения Camp Card."
        );
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

bot.hears(
    "📜 История",
    async (ctx) => {
        await ctx.reply(
            "📜 История операций пока пуста."
        );
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