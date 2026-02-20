import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";

export interface Particle {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  emoji: string;
  duration: number;
  delay: number;
}

interface ParticleSystemProps {
  particles: Particle[];
  onParticlesComplete?: () => void;
}

export const ParticleSystem: React.FC<ParticleSystemProps> = ({
  particles,
  onParticlesComplete,
}) => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle) => (
        <ParticleItem
          key={particle.id}
          particle={particle}
          onComplete={onParticlesComplete}
        />
      ))}
    </View>
  );
};

interface ParticleItemProps {
  particle: Particle;
  onComplete?: () => void;
}

const ParticleItem: React.FC<ParticleItemProps> = ({ particle, onComplete }) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(particle.delay),
      Animated.timing(progress, {
        toValue: 1,
        duration: particle.duration,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onComplete) onComplete();
    });
  }, []);

  // Derive animated properties using RN Animated.Value.interpolate()
  const x = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [particle.x, particle.targetX],
  });

  const y = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [particle.y, particle.targetY],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 1, 0],
  });

  const scale = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.3, 1.2, 0.4],
  });

  const rotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.Text
      style={[
        styles.particle,
        {
          left: 0,
          top: 0,
          opacity,
          transform: [
            { translateX: x },
            { translateY: y },
            { scale },
            { rotate: rotation },
          ],
        },
      ]}
    >
      {particle.emoji}
    </Animated.Text>
  );
};

const styles = StyleSheet.create({
  particle: {
    fontSize: 24,
    position: "absolute",
    fontWeight: "700",
  },
});

/**
 * Generate particles for seed explosion effect
 * @param sourceX Center X of the card that was tapped
 * @param sourceY Center Y of the card that was tapped
 * @param targetX X coordinate of score counter
 * @param targetY Y coordinate of score counter
 * @param count Number of particles (10-15)
 * @returns Array of Particle objects
 */
export function generateExplosionParticles(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  count: number = 12
): Particle[] {
  const particles: Particle[] = [];
  const emojis = ["🌱", "🌿", "🌾", "✨", "🍃"];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const distance = Math.random() * 60 + 40;

    particles.push({
      id: `particle-${i}-${Date.now()}`,
      x: sourceX,
      y: sourceY,
      targetX: sourceX + Math.cos(angle) * distance,
      targetY: sourceY + Math.sin(angle) * distance,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      duration: 800 + Math.random() * 400,
      delay: Math.random() * 50,
    });
  }

  return particles;
}
