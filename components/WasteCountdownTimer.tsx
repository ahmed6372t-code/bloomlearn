import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
    StyleSheet, 
    Text, 
    View, 
    TouchableOpacity, 
    AppState, 
    AppStateStatus,
    Animated
} from "react-native";
import { useProgress, type OrganicWasteItem } from "../context/ProgressContext";
import { useTheme } from "../context/ThemeContext";

const TWENTY_FOUR_HOURS_MS = 86400000;

interface Props {
    wasteItem: OrganicWasteItem;
}

export default function WasteCountdownTimer({ wasteItem }: Props) {
    const { harvestFertilizer } = useProgress();
    const { colors } = useTheme();
    const [remainingMs, setRemainingMs] = useState(0);
    const appState = useRef(AppState.currentState);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

    const calculateRemaining = useCallback(() => {
        const targetTime = wasteItem.addedAt + TWENTY_FOUR_HOURS_MS;
        return Math.max(0, targetTime - Date.now());
    }, [wasteItem.addedAt]);

    // Initial calculation and AppState Background/Foreground Sync
    useEffect(() => {
        setRemainingMs(calculateRemaining());

        const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === "active"
            ) {
                // Instantly re-sync when app comes back to foreground
                setRemainingMs(calculateRemaining());
            }
            appState.current = nextAppState;
        });

        return () => subscription.remove();
    }, [calculateRemaining]);

    // Regular active tick
    useEffect(() => {
        const interval = setInterval(() => {
            setRemainingMs(calculateRemaining());
        }, 1000);

        return () => clearInterval(interval);
    }, [calculateRemaining]);

    // Formatting HH:MM:SS
    const h = Math.floor(remainingMs / (1000 * 60 * 60));
    const m = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const sec = Math.floor((remainingMs % (1000 * 60)) / 1000);

    const formattedTime = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    const isReady = remainingMs === 0;

    useEffect(() => {
        if (!isReady) {
            pulseLoop.current?.stop();
            pulseLoop.current = null;
            pulseAnim.setValue(1);
            return;
        }

        pulseLoop.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 650,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 650,
                    useNativeDriver: true,
                })
            ])
        );

        pulseLoop.current.start();

        return () => {
            pulseLoop.current?.stop();
            pulseLoop.current = null;
            pulseAnim.setValue(1);
        };
    }, [isReady, pulseAnim]);

    return (
        <View style={s.container}>
            {isReady ? (
                <Animated.View style={{ transform: [{ scale: pulseAnim }], width: "100%" }}>
                    <TouchableOpacity 
                        style={[s.btn, { backgroundColor: colors.accent }]}
                        onPress={() => harvestFertilizer(wasteItem.id)}
                        activeOpacity={0.8}
                    >
                        <Text style={s.btnText}>Harvest Fertilizer</Text>
                    </TouchableOpacity>
                </Animated.View>
            ) : (
                <View style={[s.timerBox, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Text style={[s.timerLabel, { color: colors.muted }]}>Fermenting...</Text>
                    <Text style={[s.timerText, { color: colors.text }]}>{formattedTime}</Text>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        marginVertical: 8,
        alignItems: "center",
        width: "100%",
    },
    btn: {
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: "center",
        width: "100%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    btnText: {
        color: "#FFF",
        fontSize: 16,
        fontWeight: "700",
    },
    timerBox: {
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: "center",
        width: "100%",
        borderWidth: 1.5,
    },
    timerLabel: {
        fontSize: 12,
        fontWeight: "700",
        marginBottom: 4,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    timerText: {
        fontSize: 22,
        fontWeight: "800",
        fontVariant: ["tabular-nums"], // Ensures numbers don't jump around
    }
});
