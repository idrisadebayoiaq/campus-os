import { Redirect } from "expo-router";

/** Legacy /explore/marketplace → Market hub Marketplace mode. */
export default function MarketplaceExploreRedirect() {
  return (
    <Redirect
      href={{
        pathname: "/(tabs)/marketplace",
        params: { mode: "marketplace" },
      }}
    />
  );
}
