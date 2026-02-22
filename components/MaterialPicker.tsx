import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import type { MaterialRecord } from "../context/ProgressContext";
import { useTheme } from "../context/ThemeContext";

interface MaterialPickerProps {
    materials: Record<string, MaterialRecord>;
    selectedId?: string;
    onSelect: (materialId: string) => void;
    title?: string;
}

export default function MaterialPicker({ materials, selectedId, onSelect, title }: MaterialPickerProps) {
    const { colors } = useTheme();
    const entries = Object.entries(materials);

    if (entries.length === 0) {
        return (
            <View style={[s.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.emptyText, { color: colors.muted }]}>No materials yet.</Text>
            </View>
        );
    }

    return (
        <View style={s.container}>
            {title ? <Text style={[s.title, { color: colors.muted }]}>{title}</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
                {entries.map(([id, material]) => {
                    const active = id === selectedId;
                    return (
                        <TouchableOpacity
                            key={id}
                            style={[
                                s.pill,
                                { backgroundColor: colors.surface, borderColor: colors.border },
                                active && [s.pillActive, { backgroundColor: colors.accent }],
                            ]}
                            onPress={() => onSelect(id)}
                            activeOpacity={0.8}
                        >
                            <Text
                                style={[
                                    s.pillText,
                                    { color: colors.text },
                                    active && [s.pillTextActive, { color: colors.surface }],
                                ]}
                                numberOfLines={1}
                            >
                                {material.title}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { marginBottom: 14 },
    title: { fontSize: 12, fontWeight: "700", marginBottom: 8 },
    row: { gap: 8, paddingRight: 10 },
    pill: { borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, maxWidth: 180, borderWidth: 1 },
    pillActive: {},
    pillText: { fontSize: 12, fontWeight: "700" },
    pillTextActive: {},
    emptyBox: { borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1 },
    emptyText: { fontSize: 12 },
});
