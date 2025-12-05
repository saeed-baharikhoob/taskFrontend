import React, { Fragment } from "react";

import TopHotTokensInline from "./TopHotTokensInline";
import TokenDetail from "./token-detail";
import { IToken } from "@/types/token.type";
import MobileNavigator from "./MobileNavigator";
import { TOKEN_PAGE_PARAMS } from "@/utils/pageParams";
import TokenOverview from "./token-overview";
import NetworkSyncClient from "./NetworkSyncClient";

interface Props {
  params: IParam;
  searchParams?: searchParams;
  token: IToken;
}

type IParam = {
  params: [string, string];
};

type searchParams = {
  network: string;
};

const TokenPage = ({ params, token }: Props) => {
  return (
    <Fragment>
      <NetworkSyncClient network={params.params[TOKEN_PAGE_PARAMS.NETWORK]} />
      <div className="hidden md:flex flex-col gap-6 items-center justify-center w-full">
        <TokenOverview
          token={token}
          tokenAddress={params.params[TOKEN_PAGE_PARAMS.CONTRACT_ADDRESS]}
          network={params.params[TOKEN_PAGE_PARAMS.NETWORK]}
        />
        <TopHotTokensInline />

        <TokenDetail
          token={token}
          tokenAddress={params.params[TOKEN_PAGE_PARAMS.CONTRACT_ADDRESS]}
          network={params.params[TOKEN_PAGE_PARAMS.NETWORK]}
        />
      </div>
      <div className="flex md:hidden">
        <MobileNavigator
          token={token}
          tokenAddress={params.params[TOKEN_PAGE_PARAMS.CONTRACT_ADDRESS]}
          network={params.params[TOKEN_PAGE_PARAMS.NETWORK]}
        />
      </div>
    </Fragment>
  );
};

export default TokenPage;
