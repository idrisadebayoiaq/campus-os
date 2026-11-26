import { Ionicons } from "@expo/vector-icons";
import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type Ref,
} from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { LatLng } from "@/src/lib/location";
import { useTheme } from "@/src/theme/ThemeProvider";

type WebViewHandle = { injectJavaScript: (script: string) => void };

// react-native-webview's class typings don't line up with RN 0.88's JSX types yet.
const MapWebView = WebView as unknown as ComponentType<{
  ref?: Ref<WebViewHandle>;
  originWhitelist: string[];
  source: { html: string };
  onMessage: (event: WebViewMessageEvent) => void;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  setSupportMultipleWindows?: boolean;
  overScrollMode?: "never" | "always" | "content";
  style?: StyleProp<ViewStyle>;
}>;

export type MapPickerHandle = {
  flyTo: (point: LatLng, zoom?: number) => void;
};

function mapHtml(center: LatLng, zoom: number, dark: boolean) {
  const tiles = dark ? "dark_all" : "rastertiles/voyager";
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;height:100%;background:${dark ? "#1A1428" : "#EEF0F3"}}
.leaflet-control-attribution{font-size:9px;opacity:.75}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false}).setView([${center.lat},${center.lng}],${zoom});
L.tileLayer('https://{s}.basemaps.cartocdn.com/${tiles}/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
function post(t){var c=map.getCenter();window.ReactNativeWebView.postMessage(JSON.stringify({type:t,lat:c.lat,lng:c.lng}));}
map.on('movestart',function(){post('movestart');});
map.on('moveend',function(){post('moveend');});
window.flyTo=function(lat,lng,z){map.flyTo([lat,lng],z||Math.max(map.getZoom(),15),{duration:0.6});};
post('ready');
</script></body></html>`;
}

/**
 * Pan-to-pick map: the pin stays in the middle, the user drags the map under it.
 */
export function MapPicker({
  ref,
  initial,
  zoom = 15,
  onCenterChange,
  onMoveStart,
}: {
  ref?: Ref<MapPickerHandle>;
  initial: LatLng;
  zoom?: number;
  onCenterChange: (point: LatLng) => void;
  onMoveStart?: () => void;
}) {
  const colors = useTheme();
  const web = useRef<WebViewHandle>(null);
  const [moving, setMoving] = useState(false);
  const dark = colors.bg.toLowerCase() === "#1a1428";
  // Only build the page once; later moves go through flyTo.
  const html = useMemo(() => mapHtml(initial, zoom, dark), [dark]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    flyTo: (p, z) => {
      web.current?.injectJavaScript(`window.flyTo(${p.lat},${p.lng},${z ?? "undefined"});true;`);
    },
  }));

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type: string; lat: number; lng: number };
      if (msg.type === "movestart") {
        setMoving(true);
        onMoveStart?.();
      } else if (msg.type === "moveend" || msg.type === "ready") {
        setMoving(false);
        onCenterChange({ lat: msg.lat, lng: msg.lng });
      }
    } catch {
      // ignore malformed messages
    }
  }

  return (
    <View style={styles.wrap}>
      <MapWebView
        ref={web}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        style={styles.flex}
      />
      <View pointerEvents="none" style={styles.pinLayer}>
        <View style={{ transform: [{ translateY: moving ? -32 : -24 }], alignItems: "center" }}>
          <View style={[styles.pinHead, { backgroundColor: colors.inverseBg }]}>
            <View style={[styles.pinDot, { backgroundColor: colors.accent }]} />
          </View>
          <View style={[styles.pinStem, { backgroundColor: colors.inverseBg }]} />
        </View>
        <View style={[styles.pinShadow, { opacity: moving ? 0.18 : 0.35 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
  flex: { flex: 1, backgroundColor: "transparent" },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  pinHead: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  pinDot: { width: 10, height: 10, borderRadius: 5 },
  pinStem: { width: 3, height: 12, marginTop: -1, borderRadius: 2 },
  pinShadow: {
    position: "absolute",
    width: 14,
    height: 6,
    borderRadius: 7,
    backgroundColor: "#000",
  },
});
