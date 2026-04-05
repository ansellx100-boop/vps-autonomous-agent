/**
 * Нормализация и аналитика тренировок Garmin.
 */

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mapTypeLabel(typeKey) {
  const key = String(typeKey || '').toLowerCase();
  if (key.includes('running')) return 'Бег';
  if (key.includes('cycling')) return 'Велосипед';
  if (key.includes('walking')) return 'Ходьба';
  if (key.includes('hiking')) return 'Хайкинг';
  if (key.includes('strength')) return 'Силовая';
  if (key.includes('fitness')) return 'Фитнес';
  return key || 'other';
}

function isRunLikeType(typeKey) {
  const key = String(typeKey || '').toLowerCase();
  return key.includes('running') || key.includes('walking') || key.includes('hiking');
}

/**
 * Привести запись активности Garmin к единому виду.
 */
export function normalizeGarminActivity(activity) {
  const typeKey =
    activity?.activityType?.typeKey ||
    activity?.activityTypeDTO?.typeKey ||
    'other';
  const startTime =
    activity?.startTimeLocal ||
    activity?.summaryDTO?.startTimeLocal ||
    activity?.startTimeGMT ||
    activity?.summaryDTO?.startTimeGMT ||
    null;

  return {
    activityId: activity?.activityId || null,
    typeKey,
    typeLabel: mapTypeLabel(typeKey),
    startTime,
    distanceMeters: toNumber(activity?.distance ?? activity?.summaryDTO?.distance),
    durationSeconds: toNumber(
      activity?.duration ??
      activity?.summaryDTO?.duration ??
      activity?.elapsedDuration ??
      activity?.summaryDTO?.elapsedDuration
    ),
    calories: toNumber(activity?.calories ?? activity?.summaryDTO?.calories),
    averageHr: toNumber(activity?.averageHR ?? activity?.summaryDTO?.averageHR),
    maxHr: toNumber(activity?.maxHR ?? activity?.summaryDTO?.maxHR),
  };
}

function buildEmptyBlock() {
  return { sessions: 0, distanceKm: 0, durationHours: 0 };
}

function summarizeBlock(items) {
  const sessions = items.length;
  const distanceKm = items.reduce((acc, item) => acc + item.distanceMeters, 0) / 1000;
  const durationHours = items.reduce((acc, item) => acc + item.durationSeconds, 0) / 3600;
  return {
    sessions,
    distanceKm: round(distanceKm, 1),
    durationHours: round(durationHours, 1),
  };
}

function percentChange(prev, next) {
  if (!prev && !next) return 0;
  if (!prev && next) return 100;
  return round(((next - prev) / prev) * 100, 1);
}

/**
 * Основная аналитика по тренировкам.
 */
export function analyzeGarminActivities(rawActivities, { days = 30, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const sinceMs = nowMs - days * 24 * 60 * 60 * 1000;
  const activities = (Array.isArray(rawActivities) ? rawActivities : [])
    .map(normalizeGarminActivity)
    .filter((a) => a.startTime && Number.isFinite(new Date(a.startTime).getTime()))
    .filter((a) => new Date(a.startTime).getTime() >= sinceMs)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const totalActivities = activities.length;
  const totalDistanceKm = round(activities.reduce((acc, a) => acc + a.distanceMeters, 0) / 1000, 1);
  const totalDurationHours = round(activities.reduce((acc, a) => acc + a.durationSeconds, 0) / 3600, 1);
  const totalCalories = round(activities.reduce((acc, a) => acc + a.calories, 0), 0);
  const avgHeartRateValues = activities.map((a) => a.averageHr).filter((v) => v > 0);
  const avgHeartRate = avgHeartRateValues.length
    ? round(avgHeartRateValues.reduce((acc, v) => acc + v, 0) / avgHeartRateValues.length, 0)
    : 0;

  const perTypeMap = new Map();
  for (const a of activities) {
    const key = a.typeKey;
    const prev = perTypeMap.get(key) || {
      typeKey: key,
      typeLabel: a.typeLabel,
      sessions: 0,
      distanceKm: 0,
      durationHours: 0,
    };
    prev.sessions += 1;
    prev.distanceKm += a.distanceMeters / 1000;
    prev.durationHours += a.durationSeconds / 3600;
    perTypeMap.set(key, prev);
  }

  const activityTypeBreakdown = [...perTypeMap.values()]
    .map((item) => ({
      ...item,
      distanceKm: round(item.distanceKm, 1),
      durationHours: round(item.durationHours, 1),
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const runLike = activities.filter((a) => isRunLikeType(a.typeKey));
  const runLikeDistanceKm = runLike.reduce((acc, a) => acc + a.distanceMeters, 0) / 1000;
  const runLikeDurationMinutes = runLike.reduce((acc, a) => acc + a.durationSeconds, 0) / 60;
  const runLikeHrValues = runLike.map((a) => a.averageHr).filter((v) => v > 0);
  const running = {
    sessions: runLike.length,
    totalDistanceKm: round(runLikeDistanceKm, 1),
    totalDurationHours: round(runLikeDurationMinutes / 60, 1),
    avgPaceMinPerKm: runLikeDistanceKm > 0 ? round(runLikeDurationMinutes / runLikeDistanceKm, 2) : 0,
    avgHeartRate: runLikeHrValues.length
      ? round(runLikeHrValues.reduce((acc, v) => acc + v, 0) / runLikeHrValues.length, 0)
      : 0,
  };

  const last7StartMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const prev7StartMs = nowMs - 14 * 24 * 60 * 60 * 1000;
  const last7Items = activities.filter((a) => new Date(a.startTime).getTime() >= last7StartMs);
  const prev7Items = activities.filter((a) => {
    const ts = new Date(a.startTime).getTime();
    return ts >= prev7StartMs && ts < last7StartMs;
  });
  const last7 = last7Items.length ? summarizeBlock(last7Items) : buildEmptyBlock();
  const previous7 = prev7Items.length ? summarizeBlock(prev7Items) : buildEmptyBlock();
  const trend7d = {
    last7,
    previous7,
    distanceChangePct: percentChange(previous7.distanceKm, last7.distanceKm),
    sessionsChangePct: percentChange(previous7.sessions, last7.sessions),
  };

  return {
    windowDays: days,
    totalActivities,
    totalDistanceKm,
    totalDurationHours,
    totalCalories,
    avgHeartRate,
    activityTypeBreakdown,
    running,
    trend7d,
    activities,
  };
}

function buildHeuristicRecommendations(metrics) {
  const advice = [];
  const workoutsPerWeek = (metrics.totalActivities / metrics.windowDays) * 7;
  if (workoutsPerWeek < 3) advice.push('Добавьте 1-2 лёгкие тренировки в неделю для стабильной базы.');
  if (metrics.trend7d.distanceChangePct > 30) {
    advice.push('Объём резко вырос: добавьте восстановление и снизьте интенсивность на 1-2 дня.');
  }
  if (metrics.running.sessions > 0 && metrics.running.avgHeartRate > 160) {
    advice.push('Средний пульс по беговым тренировкам высокий: оставьте больше Z2-нагрузки.');
  }
  if (metrics.running.sessions > 0 && metrics.running.avgPaceMinPerKm > 6.5) {
    advice.push('Темп можно улучшать через 1 темповую или интервальную сессию в неделю.');
  }
  if (advice.length === 0) {
    advice.push('Баланс нагрузки выглядит ровно: продолжайте текущий цикл и отслеживайте самочувствие.');
  }
  return advice;
}

export function formatGarminMetricsForLlm(metrics) {
  return {
    periodDays: metrics.windowDays,
    totals: {
      workouts: metrics.totalActivities,
      distanceKm: metrics.totalDistanceKm,
      durationHours: metrics.totalDurationHours,
      calories: metrics.totalCalories,
      avgHeartRate: metrics.avgHeartRate,
    },
    running: metrics.running,
    trend7d: metrics.trend7d,
    byType: metrics.activityTypeBreakdown.map((t) => ({
      type: t.typeKey,
      sessions: t.sessions,
      distanceKm: t.distanceKm,
      durationHours: t.durationHours,
    })),
  };
}

/**
 * Сформировать итоговый отчёт в человеко-читаемом виде.
 */
export function buildGarminReport(metrics, { llmInsights = '' } = {}) {
  const byTypeText = metrics.activityTypeBreakdown.length
    ? metrics.activityTypeBreakdown
      .map((t) => `- ${t.typeLabel}: ${t.sessions} трен., ${t.distanceKm} км, ${t.durationHours} ч`)
      .join('\n')
    : '- Нет активностей за период.';

  const runLine = metrics.running.sessions > 0
    ? `Бего-подобные тренировки: ${metrics.running.sessions} шт., ${metrics.running.totalDistanceKm} км, средний темп ${metrics.running.avgPaceMinPerKm} мин/км, средний пульс ${metrics.running.avgHeartRate}.`
    : 'Бего-подобных тренировок за период нет.';

  const trendLine = `Тренд 7 дней к предыдущим 7: дистанция ${metrics.trend7d.last7.distanceKm} км vs ${metrics.trend7d.previous7.distanceKm} км (${metrics.trend7d.distanceChangePct}%), тренировок ${metrics.trend7d.last7.sessions} vs ${metrics.trend7d.previous7.sessions} (${metrics.trend7d.sessionsChangePct}%).`;

  const recommendations = buildHeuristicRecommendations(metrics)
    .map((line, idx) => `${idx + 1}. ${line}`)
    .join('\n');

  const llmSection = llmInsights?.trim()
    ? `\n\nAI-рекомендации:\n${llmInsights.trim()}`
    : '';

  return [
    `Анализ тренировок Garmin за ${metrics.windowDays} дн.`,
    '',
    `Всего тренировок: ${metrics.totalActivities}.`,
    `Общий объём: ${metrics.totalDistanceKm} км, ${metrics.totalDurationHours} ч, ${metrics.totalCalories} ккал.`,
    `Средний пульс: ${metrics.avgHeartRate}.`,
    '',
    'Разбивка по типам:',
    byTypeText,
    '',
    runLine,
    trendLine,
    '',
    'Базовые рекомендации:',
    recommendations,
    llmSection,
  ].join('\n');
}
