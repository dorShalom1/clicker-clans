import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Mode = "classic" | "multiplayer";
type UpgradeKey = "powerTap" | "autoTap";

type DailyRewardState = {
  lastClaimAt: number;
  streak: number;
};

type SavedState = {
  mode: Mode;
  totalClicks: number;
  classicClicks: number;
  teamClicks: number;
  coins: number;
  selectedTeam: string;
  teamScores: Record<string, number>;
  teamContribution: Record<string, number>;
  teamChestConsumed: Record<string, number>;
  upgradeLevels: Record<UpgradeKey, number>;
  claimedPrizes: number[];
  claimedMissionIds: string[];
  dailyReward: DailyRewardState;
  seasonNumber: number;
};

const STORAGE_KEY = "clicker_clans_save_v2";
const LEVEL_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
const TAP_COOLDOWN_MS = 90;
const TEAM_CHEST_STEP = 50;
const SEASON_TARGET = 1200;

const TEAM_NAMES = ["Solar Squad", "Ocean Owls", "Forest Foxes", "Desert Drifters"];

const PRIZES = [
  { level: 2, name: "Bronze Capsule", rewardCoins: 15 },
  { level: 4, name: "Lucky Crate", rewardCoins: 25 },
  { level: 6, name: "Silver Beacon", rewardCoins: 45 },
  { level: 8, name: "Gold Relic", rewardCoins: 70 },
  { level: 10, name: "Champion Medal", rewardCoins: 95 },
  { level: 12, name: "Legend Crown", rewardCoins: 130 },
];

const UPGRADE_META: Record<
  UpgradeKey,
  { label: string; baseCost: number; maxLevel: number; description: string }
> = {
  powerTap: {
    label: "Power Tap",
    baseCost: 20,
    maxLevel: 10,
    description: "+1 click per tap in Classic mode",
  },
  autoTap: {
    label: "Auto Tapper",
    baseCost: 35,
    maxLevel: 8,
    description: "+1 passive click per second in Classic mode",
  },
};

const createInitialTeamScores = () =>
  TEAM_NAMES.reduce<Record<string, number>>((acc, team, idx) => {
    acc[team] = 70 + idx * 20;
    return acc;
  }, {});

const createZeroTeamMap = () =>
  TEAM_NAMES.reduce<Record<string, number>>((acc, team) => {
    acc[team] = 0;
    return acc;
  }, {});

const toSafeInt = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;

const hydrateTeamMap = (value: unknown, fallback: Record<string, number>) =>
  TEAM_NAMES.reduce<Record<string, number>>((acc, team) => {
    const next =
      typeof value === "object" &&
      value !== null &&
      typeof (value as Record<string, unknown>)[team] === "number"
        ? ((value as Record<string, number>)[team] ?? fallback[team])
        : fallback[team];
    acc[team] = Math.max(0, Math.floor(next));
    return acc;
  }, {});

const formatDuration = (ms: number) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

export default function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [mode, setMode] = useState<Mode>("classic");
  const [totalClicks, setTotalClicks] = useState(0);
  const [classicClicks, setClassicClicks] = useState(0);
  const [teamClicks, setTeamClicks] = useState(0);
  const [coins, setCoins] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState(TEAM_NAMES[0]);
  const [teamScores, setTeamScores] = useState<Record<string, number>>(() =>
    createInitialTeamScores()
  );
  const [teamContribution, setTeamContribution] = useState<Record<string, number>>(() =>
    createZeroTeamMap()
  );
  const [teamChestConsumed, setTeamChestConsumed] = useState<Record<string, number>>(() =>
    createZeroTeamMap()
  );
  const [upgradeLevels, setUpgradeLevels] = useState<Record<UpgradeKey, number>>({
    powerTap: 0,
    autoTap: 0,
  });
  const [claimedPrizes, setClaimedPrizes] = useState<number[]>([]);
  const [claimedMissionIds, setClaimedMissionIds] = useState<string[]>([]);
  const [dailyReward, setDailyReward] = useState<DailyRewardState>({
    lastClaimAt: 0,
    streak: 0,
  });
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [antiSpamNotice, setAntiSpamNotice] = useState("");
  const [lastTapAt, setLastTapAt] = useState(0);
  const [lastEvent, setLastEvent] = useState("Welcome to Clicker Clans.");

  useEffect(() => {
    let active = true;

    const loadState = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw || !active) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<SavedState>;

        if (parsed.mode === "classic" || parsed.mode === "multiplayer") {
          setMode(parsed.mode);
        }
        setTotalClicks(toSafeInt(parsed.totalClicks));
        setClassicClicks(toSafeInt(parsed.classicClicks));
        setTeamClicks(toSafeInt(parsed.teamClicks));
        setCoins(toSafeInt(parsed.coins));
        if (
          typeof parsed.selectedTeam === "string" &&
          TEAM_NAMES.includes(parsed.selectedTeam)
        ) {
          setSelectedTeam(parsed.selectedTeam);
        }

        const safeTeamScores = hydrateTeamMap(parsed.teamScores, createInitialTeamScores());
        const safeTeamContribution = hydrateTeamMap(parsed.teamContribution, createZeroTeamMap());
        const safeTeamChest = hydrateTeamMap(parsed.teamChestConsumed, createZeroTeamMap());

        setTeamScores(safeTeamScores);
        setTeamContribution(safeTeamContribution);
        setTeamChestConsumed(safeTeamChest);

        const safePowerTap = toSafeInt(parsed.upgradeLevels?.powerTap);
        const safeAutoTap = toSafeInt(parsed.upgradeLevels?.autoTap);
        setUpgradeLevels({
          powerTap: Math.min(safePowerTap, UPGRADE_META.powerTap.maxLevel),
          autoTap: Math.min(safeAutoTap, UPGRADE_META.autoTap.maxLevel),
        });

        const safeClaimedPrizes = Array.isArray(parsed.claimedPrizes)
          ? Array.from(
              new Set(
                parsed.claimedPrizes
                  .map((value) => toSafeInt(value, -1))
                  .filter((value) => value > 0)
              )
            )
          : [];
        setClaimedPrizes(safeClaimedPrizes);

        const safeMissionIds = Array.isArray(parsed.claimedMissionIds)
          ? Array.from(
              new Set(
                parsed.claimedMissionIds.filter((value): value is string => typeof value === "string")
              )
            )
          : [];
        setClaimedMissionIds(safeMissionIds);

        setDailyReward({
          lastClaimAt: toSafeInt(parsed.dailyReward?.lastClaimAt),
          streak: toSafeInt(parsed.dailyReward?.streak),
        });

        setSeasonNumber(Math.max(1, toSafeInt(parsed.seasonNumber, 1)));
      } catch {
        setLastEvent("Could not load previous save, starting fresh.");
      } finally {
        if (active) {
          setIsHydrated(true);
        }
      }
    };

    loadState();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const stateToSave: SavedState = {
      mode,
      totalClicks,
      classicClicks,
      teamClicks,
      coins,
      selectedTeam,
      teamScores,
      teamContribution,
      teamChestConsumed,
      upgradeLevels,
      claimedPrizes,
      claimedMissionIds,
      dailyReward,
      seasonNumber,
    };

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave)).catch(() => {
      setLastEvent("Could not save progress this round.");
    });
  }, [
    isHydrated,
    mode,
    totalClicks,
    classicClicks,
    teamClicks,
    coins,
    selectedTeam,
    teamScores,
    teamContribution,
    teamChestConsumed,
    upgradeLevels,
    claimedPrizes,
    claimedMissionIds,
    dailyReward,
    seasonNumber,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const autoTapLevel = upgradeLevels.autoTap;
    if (autoTapLevel === 0) {
      return;
    }

    const autoTapTimer = setInterval(() => {
      setClassicClicks((prev) => prev + autoTapLevel);
      setTotalClicks((prev) => prev + autoTapLevel);
      setCoins((prev) => prev + autoTapLevel);
    }, 1000);

    return () => clearInterval(autoTapTimer);
  }, [upgradeLevels.autoTap]);

  useEffect(() => {
    const noticeTimer = setTimeout(() => setAntiSpamNotice(""), antiSpamNotice ? 1200 : 0);
    return () => clearTimeout(noticeTimer);
  }, [antiSpamNotice]);

  useEffect(() => {
    const multiplayerTick = setInterval(() => {
      setTeamScores((prev) => {
        const leader = Math.max(...Object.values(prev));
        const next = { ...prev };

        TEAM_NAMES.forEach((team) => {
          const trailingBoost = prev[team] < leader - 80 ? 1 : 0;
          const selectedBoost = team === selectedTeam ? Math.floor(Math.random() * 2) : 0;
          const baseBoost = 1 + Math.floor(Math.random() * 3);
          next[team] += baseBoost + trailingBoost + selectedBoost;
        });

        return next;
      });
    }, 2500);

    return () => clearInterval(multiplayerTick);
  }, [selectedTeam]);

  const tapPower = 1 + upgradeLevels.powerTap;
  const level = Math.floor(classicClicks / LEVEL_SIZE) + 1;
  const nextLevelProgress = (classicClicks % LEVEL_SIZE) / LEVEL_SIZE;

  const trophies = useMemo(
    () => [
      { name: "First Spark", unlocked: classicClicks >= 10 },
      { name: "Builder", unlocked: upgradeLevels.powerTap >= 3 || upgradeLevels.autoTap >= 2 },
      { name: "Prize Hunter", unlocked: claimedPrizes.length >= 3 },
      { name: "Mission Runner", unlocked: claimedMissionIds.length >= 3 },
      { name: "Steady Tapper", unlocked: elapsedSeconds >= 180 && classicClicks >= 120 },
      { name: "Legend Seed", unlocked: level >= 10 },
      { name: "Team Player", unlocked: teamClicks >= 70 },
    ],
    [
      classicClicks,
      upgradeLevels.powerTap,
      upgradeLevels.autoTap,
      claimedPrizes.length,
      claimedMissionIds.length,
      elapsedSeconds,
      level,
      teamClicks,
    ]
  );

  const missions = useMemo(
    () => [
      {
        id: "classic-100",
        label: "Reach 100 Classic clicks",
        progress: classicClicks,
        target: 100,
        reward: 40,
      },
      {
        id: "upgrades-3",
        label: "Buy 3 total upgrades",
        progress: upgradeLevels.powerTap + upgradeLevels.autoTap,
        target: 3,
        reward: 50,
      },
      {
        id: "team-120",
        label: "Contribute 120 multiplayer taps",
        progress: teamClicks,
        target: 120,
        reward: 70,
      },
    ],
    [classicClicks, upgradeLevels.powerTap, upgradeLevels.autoTap, teamClicks]
  );

  const sortedTeams = useMemo(
    () => Object.entries(teamScores).sort((a, b) => b[1] - a[1]),
    [teamScores]
  );

  const selectedTeamRank = sortedTeams.findIndex(([name]) => name === selectedTeam) + 1;
  const selectedTeamScore = teamScores[selectedTeam] ?? 0;
  const selectedTeamLevel = Math.floor(selectedTeamScore / 250) + 1;
  const seasonProgress = Math.min(selectedTeamScore / SEASON_TARGET, 1);
  const seasonLeader = sortedTeams[0] ?? [TEAM_NAMES[0], 0];
  const seasonComplete = seasonLeader[1] >= SEASON_TARGET;

  const selectedTeamContribution = teamContribution[selectedTeam] ?? 0;
  const selectedTeamChestConsumed = teamChestConsumed[selectedTeam] ?? 0;
  const chestClaimsReady = Math.floor(
    (selectedTeamContribution - selectedTeamChestConsumed) / TEAM_CHEST_STEP
  );
  const canClaimTeamChest = chestClaimsReady > 0;

  const msSinceDaily = Date.now() - dailyReward.lastClaimAt;
  const canClaimDaily = dailyReward.lastClaimAt === 0 || msSinceDaily >= DAY_MS;
  const nextDailyIn = canClaimDaily ? 0 : DAY_MS - msSinceDaily;

  const onMainClick = () => {
    if (mode === "classic") {
      setTotalClicks((prev) => prev + tapPower);
      setClassicClicks((prev) => prev + tapPower);
      setCoins((prev) => prev + tapPower);
      return;
    }

    if (seasonComplete) {
      setAntiSpamNotice("Season ended. Start the next season to keep competing.");
      return;
    }

    const now = Date.now();
    if (now - lastTapAt < TAP_COOLDOWN_MS) {
      setAntiSpamNotice("Too fast. Fair play guard skipped that tap.");
      return;
    }

    setLastTapAt(now);
    setTotalClicks((prev) => prev + 1);
    setTeamClicks((prev) => prev + 1);
    setTeamScores((prev) => ({
      ...prev,
      [selectedTeam]: prev[selectedTeam] + 1,
    }));
    setTeamContribution((prev) => ({
      ...prev,
      [selectedTeam]: prev[selectedTeam] + 1,
    }));
  };

  const buyUpgrade = (upgradeKey: UpgradeKey) => {
    const currentLevel = upgradeLevels[upgradeKey];
    const config = UPGRADE_META[upgradeKey];

    if (currentLevel >= config.maxLevel) {
      return;
    }

    const cost = config.baseCost * (currentLevel + 1);
    if (coins < cost) {
      return;
    }

    setCoins((prev) => prev - cost);
    setUpgradeLevels((prev) => ({
      ...prev,
      [upgradeKey]: prev[upgradeKey] + 1,
    }));
    setLastEvent(`Upgraded ${config.label} to level ${currentLevel + 1}.`);
  };

  const claimPrize = (levelToClaim: number, rewardCoins: number) => {
    if (claimedPrizes.includes(levelToClaim) || level < levelToClaim) {
      return;
    }

    setClaimedPrizes((prev) => [...prev, levelToClaim]);
    setCoins((prev) => prev + rewardCoins);
    setLastEvent(`Claimed level ${levelToClaim} prize for +${rewardCoins} coins.`);
  };

  const claimMission = (
    missionId: string,
    missionReward: number,
    missionTarget: number,
    missionProgress: number
  ) => {
    if (claimedMissionIds.includes(missionId) || missionProgress < missionTarget) {
      return;
    }

    setClaimedMissionIds((prev) => [...prev, missionId]);
    setCoins((prev) => prev + missionReward);
    setLastEvent(`Mission complete: +${missionReward} coins.`);
  };

  const claimDailyReward = () => {
    if (!canClaimDaily) {
      return;
    }

    const now = Date.now();
    const isStreaking =
      dailyReward.lastClaimAt > 0 && now - dailyReward.lastClaimAt < DAY_MS * 2;
    const nextStreak = isStreaking ? dailyReward.streak + 1 : 1;
    const reward = 25 + nextStreak * 7;

    setDailyReward({
      lastClaimAt: now,
      streak: nextStreak,
    });
    setCoins((prev) => prev + reward);
    setLastEvent(`Daily reward claimed: +${reward} coins (streak ${nextStreak}).`);
  };

  const claimTeamChest = () => {
    if (!canClaimTeamChest) {
      return;
    }

    const reward = 35 + selectedTeamLevel * 5;
    setCoins((prev) => prev + reward);
    setTeamChestConsumed((prev) => ({
      ...prev,
      [selectedTeam]: prev[selectedTeam] + TEAM_CHEST_STEP,
    }));
    setLastEvent(`${selectedTeam} chest opened for +${reward} coins.`);
  };

  const startNextSeason = () => {
    if (!seasonComplete) {
      return;
    }

    const closedSeason = seasonNumber;
    const winner = seasonLeader[0];
    const seasonBonus = winner === selectedTeam ? 120 : 50;

    setCoins((prev) => prev + seasonBonus);
    setSeasonNumber((prev) => prev + 1);
    setTeamScores(() =>
      TEAM_NAMES.reduce<Record<string, number>>((acc, team, idx) => {
        acc[team] = 95 + idx * 15 + Math.floor(Math.random() * 20);
        return acc;
      }, {})
    );
    setTeamContribution(createZeroTeamMap());
    setTeamChestConsumed(createZeroTeamMap());
    setAntiSpamNotice("");
    setLastEvent(
      `Season ${closedSeason} ended. ${winner} won. New season started (+${seasonBonus} coins).`
    );
  };

  const formattedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(
    elapsedSeconds % 60
  ).padStart(2, "0")}`;

  if (!isHydrated) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading your save...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Clicker Clans</Text>
        <Text style={styles.subtitle}>Tap big. Level up. Build your team.</Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, mode === "classic" && styles.modeButtonActive]}
            onPress={() => setMode("classic")}
          >
            <Text style={[styles.modeText, mode === "classic" && styles.modeTextActive]}>
              Classic
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "multiplayer" && styles.modeButtonActive]}
            onPress={() => setMode("multiplayer")}
          >
            <Text style={[styles.modeText, mode === "multiplayer" && styles.modeTextActive]}>
              Multiplayer
            </Text>
          </Pressable>
        </View>

        <Pressable style={styles.clickButton} onPress={onMainClick}>
          <Text style={styles.clickButtonLabel}>TAP</Text>
          <Text style={styles.clickButtonClicks}>
            {mode === "classic" ? classicClicks : teamClicks}
          </Text>
        </Pressable>

        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Clicks</Text>
            <Text style={styles.statValue}>{totalClicks}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Session</Text>
            <Text style={styles.statValue}>{formattedTime}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Coins</Text>
            <Text style={styles.statValue}>{coins}</Text>
          </View>
        </View>

        <View style={styles.eventBanner}>
          <Text style={styles.eventLabel}>Last event</Text>
          <Text style={styles.eventText}>{lastEvent}</Text>
        </View>

        {mode === "classic" ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Classic Progress</Text>
            <Text style={styles.levelText}>Level {level}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${nextLevelProgress * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {LEVEL_SIZE - (classicClicks % LEVEL_SIZE)} clicks to next level
            </Text>

            <Text style={styles.sectionTitle}>Daily Reward</Text>
            <View style={styles.listRowColumn}>
              <Text style={styles.listText}>Streak: {dailyReward.streak} days</Text>
              <Text style={styles.progressText}>
                {canClaimDaily
                  ? "Reward ready now"
                  : `Next reward in ${formatDuration(nextDailyIn)}`}
              </Text>
              <Pressable
                style={[styles.actionButton, !canClaimDaily && styles.actionButtonDisabled]}
                onPress={claimDailyReward}
                disabled={!canClaimDaily}
              >
                <Text style={styles.actionButtonText}>
                  {canClaimDaily ? "Claim Daily Reward" : "Not Ready"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Upgrades</Text>
            {(Object.keys(UPGRADE_META) as UpgradeKey[]).map((upgradeKey) => {
              const config = UPGRADE_META[upgradeKey];
              const currentLevel = upgradeLevels[upgradeKey];
              const cost = config.baseCost * (currentLevel + 1);
              const maxed = currentLevel >= config.maxLevel;
              const canAfford = coins >= cost;

              return (
                <View key={upgradeKey} style={styles.listRowColumn}>
                  <View style={styles.upgradeHeader}>
                    <Text style={styles.listText}>{config.label}</Text>
                    <Text style={styles.upgradeLevel}>
                      Lv {currentLevel}/{config.maxLevel}
                    </Text>
                  </View>
                  <Text style={styles.progressText}>{config.description}</Text>
                  <Pressable
                    style={[styles.actionButton, (!canAfford || maxed) && styles.actionButtonDisabled]}
                    onPress={() => buyUpgrade(upgradeKey)}
                    disabled={!canAfford || maxed}
                  >
                    <Text style={styles.actionButtonText}>
                      {maxed ? "Max Level" : `Buy (${cost} coins)`}
                    </Text>
                  </Pressable>
                </View>
              );
            })}

            <Text style={styles.sectionTitle}>Prizes</Text>
            {PRIZES.map((prize) => {
              const isUnlocked = prize.level <= level;
              const isClaimed = claimedPrizes.includes(prize.level);
              return (
                <View key={prize.name} style={styles.listRowColumn}>
                  <View style={styles.upgradeHeader}>
                    <Text style={styles.listText}>{prize.name}</Text>
                    <Text style={isUnlocked ? styles.unlocked : styles.locked}>
                      {isUnlocked ? "Unlocked" : `Lvl ${prize.level}`}
                    </Text>
                  </View>
                  <View style={styles.upgradeHeader}>
                    <Text style={styles.progressText}>Reward: +{prize.rewardCoins} coins</Text>
                    <Pressable
                      style={[styles.actionButton, (!isUnlocked || isClaimed) && styles.actionButtonDisabled]}
                      onPress={() => claimPrize(prize.level, prize.rewardCoins)}
                      disabled={!isUnlocked || isClaimed}
                    >
                      <Text style={styles.actionButtonText}>{isClaimed ? "Claimed" : "Claim"}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <Text style={styles.sectionTitle}>Missions</Text>
            {missions.map((mission) => {
              const done = mission.progress >= mission.target;
              const claimed = claimedMissionIds.includes(mission.id);
              return (
                <View key={mission.id} style={styles.listRowColumn}>
                  <Text style={styles.listText}>{mission.label}</Text>
                  <Text style={styles.progressText}>
                    {Math.min(mission.progress, mission.target)}/{mission.target} taps
                  </Text>
                  <View style={styles.upgradeHeader}>
                    <Text style={styles.progressText}>Reward: +{mission.reward} coins</Text>
                    <Pressable
                      style={[styles.actionButton, (!done || claimed) && styles.actionButtonDisabled]}
                      onPress={() =>
                        claimMission(
                          mission.id,
                          mission.reward,
                          mission.target,
                          mission.progress
                        )
                      }
                      disabled={!done || claimed}
                    >
                      <Text style={styles.actionButtonText}>
                        {claimed ? "Claimed" : done ? "Claim" : "In Progress"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <Text style={styles.sectionTitle}>Trophies</Text>
            {trophies.map((trophy) => (
              <View key={trophy.name} style={styles.listRow}>
                <Text style={styles.listText}>{trophy.name}</Text>
                <Text style={trophy.unlocked ? styles.unlocked : styles.locked}>
                  {trophy.unlocked ? "Earned" : "Locked"}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Multiplayer Teams</Text>
            <Text style={styles.progressText}>Season {seasonNumber} | Goal {SEASON_TARGET} clicks</Text>

            {antiSpamNotice ? <Text style={styles.notice}>{antiSpamNotice}</Text> : null}

            <View style={styles.teamRow}>
              {TEAM_NAMES.map((team) => (
                <Pressable
                  key={team}
                  style={[styles.teamButton, selectedTeam === team && styles.teamButtonActive]}
                  onPress={() => setSelectedTeam(team)}
                >
                  <Text
                    style={[
                      styles.teamButtonText,
                      selectedTeam === team && styles.teamButtonTextActive,
                    ]}
                  >
                    {team}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>{selectedTeam} rank: #{selectedTeamRank}</Text>
            <Text style={styles.progressText}>
              Team level {selectedTeamLevel} | Your team taps: {selectedTeamContribution}
            </Text>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${seasonProgress * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              Leader: {seasonLeader[0]} ({seasonLeader[1]} clicks)
            </Text>

            <Text style={styles.sectionTitle}>Team Chest</Text>
            <View style={styles.listRowColumn}>
              <Text style={styles.progressText}>
                Claim every {TEAM_CHEST_STEP} team taps you contribute.
              </Text>
              <Pressable
                style={[styles.actionButton, !canClaimTeamChest && styles.actionButtonDisabled]}
                onPress={claimTeamChest}
                disabled={!canClaimTeamChest}
              >
                <Text style={styles.actionButtonText}>
                  {canClaimTeamChest ? "Open Chest" : "Not Ready"}
                </Text>
              </Pressable>
            </View>

            {seasonComplete ? (
              <View style={styles.listRowColumn}>
                <Text style={styles.listText}>Season Winner: {seasonLeader[0]}</Text>
                <Text style={styles.progressText}>Start a fresh season to continue ranked taps.</Text>
                <Pressable style={styles.actionButton} onPress={startNextSeason}>
                  <Text style={styles.actionButtonText}>Start Next Season</Text>
                </Pressable>
              </View>
            ) : null}

            {sortedTeams.map(([team, score], index) => (
              <View
                key={team}
                style={[
                  styles.listRow,
                  team === selectedTeam ? styles.selectedLeaderboardRow : undefined,
                ]}
              >
                <Text style={styles.listText}>
                  {index + 1}. {team}
                </Text>
                <Text style={styles.unlocked}>{score} clicks</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0e1b1d",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#cde8d7",
    fontSize: 16,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 8,
    alignItems: "center",
  },
  title: {
    color: "#effaf2",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  subtitle: {
    color: "#9bb8a0",
    marginTop: 8,
    marginBottom: 18,
    fontSize: 15,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginBottom: 18,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#325149",
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: "#18292b",
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: "#ec7732",
    borderColor: "#ec7732",
  },
  modeText: {
    color: "#c8d4cc",
    fontWeight: "700",
  },
  modeTextActive: {
    color: "#fef4eb",
  },
  clickButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#1f9f6c",
    borderWidth: 7,
    borderColor: "#ddf7e7",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 9,
    marginBottom: 18,
  },
  clickButtonLabel: {
    color: "#e9fff4",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  clickButtonClicks: {
    color: "#f3fff8",
    fontSize: 26,
    fontWeight: "700",
    marginTop: 4,
  },
  statGrid: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#173133",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2f5355",
  },
  statLabel: {
    color: "#95b1b0",
    fontSize: 13,
  },
  statValue: {
    color: "#f0fff6",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  eventBanner: {
    width: "100%",
    backgroundColor: "#16393c",
    borderWidth: 1,
    borderColor: "#2f5a5f",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  eventLabel: {
    color: "#96c6b9",
    fontSize: 12,
    marginBottom: 3,
  },
  eventText: {
    color: "#ebfff2",
    fontSize: 13,
    fontWeight: "600",
  },
  panel: {
    width: "100%",
    backgroundColor: "#122427",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2b464c",
    padding: 14,
  },
  panelTitle: {
    color: "#f5fff7",
    fontSize: 22,
    fontWeight: "800",
  },
  levelText: {
    color: "#ffa364",
    marginTop: 8,
    fontSize: 24,
    fontWeight: "800",
  },
  progressTrack: {
    marginTop: 8,
    width: "100%",
    height: 11,
    borderRadius: 7,
    backgroundColor: "#2e4e53",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#f1924b",
  },
  progressText: {
    color: "#90adab",
    marginTop: 6,
    marginBottom: 6,
    fontSize: 13,
  },
  sectionTitle: {
    color: "#d8f8e6",
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
    fontSize: 16,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1c3437",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  selectedLeaderboardRow: {
    borderWidth: 1,
    borderColor: "#f2a163",
  },
  listRowColumn: {
    backgroundColor: "#1c3437",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  upgradeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  upgradeLevel: {
    color: "#bee9cc",
    fontWeight: "700",
  },
  listText: {
    color: "#e8f5ef",
    fontSize: 14,
    fontWeight: "600",
  },
  unlocked: {
    color: "#83ffae",
    fontWeight: "700",
  },
  locked: {
    color: "#f0a16e",
    fontWeight: "700",
  },
  teamRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  teamButton: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#2b5157",
    backgroundColor: "#193035",
  },
  teamButtonActive: {
    backgroundColor: "#ed7033",
    borderColor: "#ed7033",
  },
  teamButtonText: {
    color: "#bed9d7",
    fontWeight: "600",
  },
  teamButtonTextActive: {
    color: "#fff4ea",
  },
  actionButton: {
    backgroundColor: "#ec7732",
    alignSelf: "flex-end",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonDisabled: {
    backgroundColor: "#4b5d5f",
  },
  actionButtonText: {
    color: "#fff8f2",
    fontWeight: "700",
    fontSize: 12,
  },
  notice: {
    backgroundColor: "#6a2b1f",
    color: "#ffd8c2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    fontWeight: "600",
  },
});
