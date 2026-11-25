import { Redirect } from "expo-router";

/** Food explore folds into Market hub → Business + Food chip. */
export default function FoodRedirect() {
  return (
    <Redirect
      href={{
        pathname: "/(tabs)/marketplace",
        params: { mode: "business", chip: "food" },
      }}
    />
  );
}
