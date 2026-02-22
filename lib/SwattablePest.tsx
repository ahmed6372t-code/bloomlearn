import React, { useEffect, useRef, useMemo } from "react";
import { StyleSheet, Animated, TouchableOpacity, Text, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";

const { width, height } = Dimensions.get("window");

interface SwattablePestProps {
    onSwat: () => void;
    onMiss: () => void;
}

export function SwattablePest({ onSwat, onMiss }: SwattablePestProps) {
    const startX = useMemo(() => Math.random() * (width - 120) + 60, []);
    const startY = useMemo(() => Math.random() * (height - 300) + 100, []);
    const offsetX = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0)).current;
    const rotate = useRef(new Animated.Value(0)).current;

    const lifespan = 2000; // 2 seconds to swat!

    useEffect(() => {
        // Pop in
        Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
        }).start();

        // Jiggle around
        Animated.loop(
            Animated.sequence([
                Animated.timing(rotate, { toValue: 1, duration: 50, useNativeDriver: true }),
                Animated.timing(rotate, { toValue: -1, duration: 50, useNativeDriver: true }),
                Animated.timing(rotate, { toValue: 0, duration: 50, useNativeDriver: true }),
            ])
        ).start();

        // Move randomly slowly
        Animated.loop(
            Animated.sequence([
                Animated.timing(offsetX, { toValue: 30, duration: 500, useNativeDriver: true }),
                Animated.timing(offsetX, { toValue: -30, duration: 500, useNativeDriver: true }),
            ])
        ).start();

        // Expire if not swatted
        const timeout = setTimeout(() => {
            Animated.timing(scale, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start(() => onMiss());
        }, lifespan);

        return () => clearTimeout(timeout);
    }, []);

    const handleSwat = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Animated.timing(scale, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true
        }).start(() => onSwat());
    };

    const spin = rotate.interpolate({
        inputRange: [-1, 1],
        outputRange: ["-15deg", "15deg"]
    });

    return (
        <Animated.View
            style={[
                s.pestContainer,
                {
                    transform: [
                        { translateX: startX },
                        { translateY: startY },
                        { translateX: offsetX },
                        { scale: scale },
                        { rotate: spin }
                    ]
                }
            ]}
        >
            <TouchableOpacity activeOpacity={0.6} onPress={handleSwat} style={s.pestHitbox}>
                <Text style={s.pestEmoji}>🪲</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    pestContainer: {
        position: "absolute",
        zIndex: 9999,
    },
    pestHitbox: {
        width: 70,
        height: 70,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(255, 68, 68, 0.15)",
        borderRadius: 35,
        borderWidth: 2,
        borderColor: "rgba(255, 68, 68, 0.4)",
    },
    pestEmoji: {
        fontSize: 44,
    }
});
