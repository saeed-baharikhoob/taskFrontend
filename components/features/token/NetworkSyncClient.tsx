"use client";

import { useEffect } from "react";
import useNetworkSelector from "@/store/tokenChains/networks";
import { TOKEN_PAGE_PARAMS } from "@/utils/pageParams";

interface NetworkSyncClientProps {
  network: string;
}

/**
 * Client component that syncs the network selection from URL to global state
 */
export default function NetworkSyncClient({ network }: NetworkSyncClientProps) {
  const { setSelectedChain, availableChains } = useNetworkSelector();

  useEffect(() => {
    if (network) {
      const urlNetwork = availableChains.find(
        (chain) => chain.id === network
      );

      if (urlNetwork) setSelectedChain(urlNetwork);
    }
  }, [availableChains, network, setSelectedChain]);

  return null; // This component only handles side effects, no UI
}
