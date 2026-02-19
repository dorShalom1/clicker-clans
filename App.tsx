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

const LEVEL_SIZE = 25;
const TEAM_NAMES = ["Solar Squad", "Ocean Owls", "Forest Foxes", "Desert Drifters"];
const PRIZES = [
  { level: 2, name: "Bronze Capsule" },
  { level: 4, name: "Lucky Crate" },
  { level: 6, name: "Silver Beacon" },
  { level: 8, name: "Gold Relic" },
  { level: 10, name: "Champion Medal" },
  { level: 12, name: "Legend Crown" },
];

export default function App() {
  const [mode, setMode] = useState<Mode>("classic");
  const [totalClicks, setTotalClicks] = useState(0);
  const [classicClicks, setClassicClicks] = useState(0);
  const [teamClicks, setTeamClicks] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState(TEAM_NAMES[0]);
  const [teamScores, setTeamScores] = useState<Record<string, number>>(() =>
    TEAM_NAMES.reduce<Record<string, number>>((acc, team, idx) => {
      acc[team] = 60 + idx * 15;
      return acc;
    }, {})
  );

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const multiplayerTick = setInterval(() => {
      setTeamScores((prev) => {
        const next = { ...prev };
        TEAM_NAMES.forEach((team) => {
          const passiveBoost = team === selectedTeam ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3);
          next[team] += passiveBoost;
        });
        return next;
      });
    }, 2500);

    return () => clearInterval(multiplayerTick);
  }, [selectedTeam]);

  const level = Math.floor(classicClicks / LEVEL_SIZE) + 1;
  const nextLevelProgress = (classicClicks % LEVEL_SIZE) / LEVEL_SIZE;
  const unlockedPrizes = PRIZES.filter((prize) => prize.level <= level);
  const trophies = useMemo(
    () => [
      { name: "First Spark", unlocked: classicClicks >= 10 },
      { name: "Prize Hunter", unlocked: unlockedPrizes.length >= 3 },
      { name: "Steady Tapper", unlocked: elapsedSeconds >= 180 && classicClicks >= 120 },
      { name: "Legend Seed", unlocked: level >= 10 },
      { name: "Team Player", unlocked: teamClicks >= 40 },
    ],
    [classicClicks, elapsedSeconds, level, teamClicks, unlockedPrizes.length]
  );

  const sortedTeams = useMemo(
    () => Object.entries(teamScores).sort((a, b) => b[1] - a[1]),
    [teamScores]
  );
  const selectedTeamRank = sortedTeams.findIndex(([name]) => name === selectedTeam) + 1;

  const onMainClick = () => {
    setTotalClicks((prev) => prev + 1);

    if (mode === "classic") {
      setClassicClicks((prev) => prev + 1);
      return;
    }

    setTeamClicks((prev) => prev + 1);
    setTeamScores((prev) => ({
      ...prev,
      [selectedTeam]: prev[selectedTeam] + 1,
    }));
  };

  const formattedTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

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
            <Text style={[styles.modeText, mode === "classic" && styles.modeTextActive]}>Classic</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "multiplayer" && styles.modeButtonActive]}
            onPress={() => setMode("multiplayer")}
          >
            <Text style={[styles.modeText, mode === "multiplayer" && styles.modeTextActive]}>Multiplayer</Text>
          </Pressable>
        </View>

        <Pressable style={styles.clickButton} onPress={onMainClick}>
          <Text style={styles.clickButtonLabel}>TAP</Text>
          <Text style={styles.clickButtonClicks}>{mode === "classic" ? classicClicks : teamClicks}</Text>
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

            <Text style={styles.sectionTitle}>Prizes</Text>
            {PRIZES.map((prize) => (
              <View key={prize.name} style={styles.listRow}>
                <Text style={styles.listText}>{prize.name}</Text>
                <Text style={prize.level <= level ? styles.unlocked : styles.locked}>
                  {prize.level <= level ? "Unlocked" : `Lvl ${prize.level}`}
                </Text>
              </View>
            ))}

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
            <Text style={styles.progressText}>Join a team, tap together, and race the leaderboard.</Text>

            <View style={styles.teamRow}>
              {TEAM_NAMES.map((team) => (
                <Pressable
                  key={team}
                  style={[styles.teamButton, selectedTeam === team && styles.teamButtonActive]}
                  onPress={() => setSelectedTeam(team)}
                >
                  <Text style={[styles.teamButtonText, selectedTeam === team && styles.teamButtonTextActive]}>
                    {team}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              {selectedTeam} rank: #{selectedTeamRank}
            </Text>
            {sortedTeams.map(([team, score], index) => (
              <View key={team} style={styles.listRow}>
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
  content: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 8,
    alignItems: 'center',
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
    marginBottom: 14,
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
    fontSize: 24,
    fontWeight: "800",
    marginTop: 4,
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
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#d8f8e6",
    fontWeight: "700",
    marginTop: 10,
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
});
