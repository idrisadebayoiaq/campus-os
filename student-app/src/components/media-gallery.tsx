import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

export type GalleryItem = { url: string; kind: "image" | "video" };

const { width: SCREEN_W } = Dimensions.get("window");

function VideoSlide({
  url,
  width,
  height,
  active,
}: {
  url: string;
  width: number;
  height: number;
  active: boolean;
}) {
  const [started, setStarted] = useState(false);

  // Stop and reset when the slide is swiped away.
  useEffect(() => {
    if (!active) setStarted(false);
  }, [active]);

  if (!started) {
    return (
      <Pressable
        onPress={() => setStarted(true)}
        style={[styles.videoPoster, { width, height }]}
        accessibilityLabel="Play video"
      >
        <View style={styles.playCircle}>
          <Ionicons name="play" size={30} color="#fff" />
        </View>
        <View style={styles.videoTag}>
          <Ionicons name="videocam" size={12} color="#fff" />
        </View>
      </Pressable>
    );
  }
  return <PlayingVideo url={url} width={width} height={height} />;
}

function PlayingVideo({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width, height, backgroundColor: "#000" }}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

/** Swipeable photo + video gallery. Videos start when tapped. */
export function MediaGallery({
  items,
  height = 320,
  width = SCREEN_W,
  index,
  onIndexChange,
  placeholderColor = "#3C315B",
}: {
  items: GalleryItem[];
  height?: number;
  width?: number;
  index: number;
  onIndexChange: (next: number) => void;
  placeholderColor?: string;
}) {
  const listRef = useRef<FlatList<GalleryItem>>(null);
  const current = useRef(index);

  // Jump when the parent changes the index (e.g. thumbnail tap).
  useEffect(() => {
    if (index !== current.current && items.length) {
      current.current = index;
      listRef.current?.scrollToIndex({ index, animated: true });
    }
  }, [index, items.length]);

  if (!items.length) {
    return <View style={{ width, height, backgroundColor: placeholderColor }} />;
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== current.current) {
      current.current = next;
      onIndexChange(next);
    }
  }

  return (
    <View style={{ width, height }}>
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${item.url}-${i}`}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onScrollEnd}
        initialNumToRender={2}
        windowSize={3}
        renderItem={({ item, index: i }) =>
          item.kind === "video" ? (
            <VideoSlide url={item.url} width={width} height={height} active={i === index} />
          ) : (
            <Image source={{ uri: item.url }} style={{ width, height }} resizeMode="cover" />
          )
        }
      />
      {items.length > 1 ? (
        <View style={styles.counter}>
          <Ionicons
            name={items[index]?.kind === "video" ? "videocam" : "images"}
            size={12}
            color="#fff"
          />
          <View style={{ width: 4 }} />
          <Text style={styles.counterText}>{`${index + 1} / ${items.length}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  videoPoster: {
    backgroundColor: "#1a1428",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(171,159,242,0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  videoTag: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  counter: {
    position: "absolute",
    right: 14,
    bottom: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  counterText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
