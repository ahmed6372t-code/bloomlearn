import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  Extrapolate,
  runOnJS,
} from "react-native-reanimated";

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
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      particle.delay,
      withTiming(1, {
        duration: particle.duration,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const x = interpolate(
      progress.value,
      [0, 1],
      [particle.x, particle.targetX],
      Extrapolate.CLAMP
    );

    const y = interpolate(
      progress.value,
      [0, 1],
      [particle.y, particle.targetY],
      Extrapolate.CLAMP
    );

    // Fade out as particle reaches target
    const opacity = interpolate(
      progress.value,
      [0, 0.7, 1],
      [1, 1, 0],
      Extrapolate.CLAMP
    );

    // Scale: start small, grow slightly, then shrink
    const scale = interpolate(
      progress.value,
      [0, 0.3, 1],
      [0.3, 1.2, 0.4],
      Extrapolate.CLAMP
    );

    // Rotation for visual interest
    const rotation = interpolate(progress.value, [0, 1], [0, 360]);

    return {
      transform: [
        { translateX: x },
        { translateY: y },
        { scale },
        { rotate: `${rotation}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.Text
      style={[
        styles.particle,
        animatedStyle,
        {
          left: 0,
          top: 0,
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
    // Distribute particles in a circle around source
    const angle = (i / count) * Math.PI * 2;
    const distance = Math.random() * 60 + 40; // 40-100px from center

    const explodeX = sourceX + Math.cos(angle) * distance;
    const explodeY = sourceY + Math.sin(angle) * distance;

    particles.push({
      id: `particle-${i}-${Date.now()}`,
      x: sourceX,
      y: sourceY,
      targetX,
      targetY,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      duration: 800 + Math.random() * 400, // 800-1200ms
      delay: Math.random() * 50, // Stagger by 0-50ms
    });
  }

  return particles;
}
