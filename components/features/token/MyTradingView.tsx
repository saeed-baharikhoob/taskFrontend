import { useEffect, useRef, useState, useCallback } from "react";
import {
    ChartingLibraryWidgetOptions,
    IBasicDataFeed,
    IDatafeedQuotesApi,
    ResolutionString,
    Timezone,
    SeriesFormat,
    widget as TradingViewWidget,
} from "@/public/static/charting_library";
import { IOhlcvData } from "@/types/datafeed.type";
import { usePathname } from "next/navigation";
import { searchToken, getDataFeed } from "@/services/http/token.http";

interface Props {
    chartOptions: Partial<ChartingLibraryWidgetOptions>;
    ohlcvData: IOhlcvData[];
    className?: string;
    tokenDescription: string;
    tokenExchange: string;
    theme: "dark" | "light";
    network: string;
    customSymbols?: Array<{
        symbol: string;
        full_name: string;
        description: string;
    }>;
}


const subscriptionIntervals: Map<string, NodeJS.Timeout> = new Map();

const symbolDataCache: Map<string, IOhlcvData[]> = new Map();


let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const MyTradingView = ({
                           chartOptions,
                           ohlcvData,
                           theme,
                           tokenDescription,
                           tokenExchange,
                           network,
                           customSymbols = [],
                       }: Props) => {
    const chartContainerRef =
        useRef<HTMLDivElement>() as React.MutableRefObject<HTMLInputElement>;
    const [chartIsReady, setChartIsReady] = useState(false);
    const myWidget = useRef<any>();
    const pathname = usePathname();

    const fetchTokenOhlcvData = useCallback(async (
        tokenAddress: string,
        tokenNetwork: string
    ): Promise<IOhlcvData[]> => {
        const cacheKey = `${tokenNetwork}_${tokenAddress}`;

        if (symbolDataCache.has(cacheKey)) {
            const cachedData = symbolDataCache.get(cacheKey)!;
            return cachedData;
        }

        try {
            const [minuteResponse, hourResponse, dayResponse] = await Promise.all([
                getDataFeed({
                    params: {
                        contractAddress: tokenAddress,
                        network: tokenNetwork,
                        timeframe: "minute",
                        aggregate: 5
                    }
                }),
                getDataFeed({
                    params: {
                        contractAddress: tokenAddress,
                        network: tokenNetwork,
                        timeframe: "hour",
                        aggregate: 1
                    }
                }),
                getDataFeed({
                    params: {
                        contractAddress: tokenAddress,
                        network: tokenNetwork,
                        timeframe: "day",
                        aggregate: 1
                    }
                })
            ]);

            const minuteList = minuteResponse?.data?.attributes?.ohlcv_list || [];
            const hourList = hourResponse?.data?.attributes?.ohlcv_list || [];
            const dayList = dayResponse?.data?.attributes?.ohlcv_list || [];

            const convertToOhlcv = (list: number[][]): IOhlcvData[] => {
                return list.map(item => ({
                    time: item[0],
                    open: item[1],
                    high: item[2],
                    low: item[3],
                    close: item[4],
                    volume: item[5]
                }));
            };

            const minuteData = convertToOhlcv(minuteList);
            const hourData = convertToOhlcv(hourList);
            const dayData = convertToOhlcv(dayList);

            const allData = [...dayData, ...hourData, ...minuteData];

            const uniqueDataMap = new Map<number, IOhlcvData>();
            allData.forEach(bar => {
                uniqueDataMap.set(bar.time, bar);
            });

            const mergedData = Array.from(uniqueDataMap.values())
                .sort((a, b) => a.time - b.time);

            symbolDataCache.set(cacheKey, mergedData);
            return mergedData;
        } catch (error) {
            console.error("error:", error);
            return [];
        }
    }, []);


    const handleSearch = useCallback(async (
        userInput: string,
        onResultReadyCallback: (results: any[]) => void
    ) => {
        try {
            const response = await searchToken({
                params: {
                    currencyAddress: userInput,
                    network: network,
                }
            });

            const results = response.data || [];

            const formattedResults = results.map((item: any) => {
                const attributes = item.attributes || {};
                const poolAddress = attributes.address;
                const itemIdParts = item.id?.split("_") || [];
                const tokenNetwork = itemIdParts[0] || network;

                const symbolId = `${tokenNetwork}_${poolAddress}`;

                symbolDataCache.set(`info_${symbolId}`, {
                    description: attributes.name || item.id,
                    exchange: item.relationships?.dex?.data?.id || "DEX",
                    address: poolAddress,
                    network: tokenNetwork,
                    tokenAddress: item.relationships?.base_token?.data?.id?.split("_")[1],
                } as any);

                return {
                    symbol: attributes.name || item.id,
                    full_name: attributes.name || item.id,
                    description: `Network: ${tokenNetwork}`,
                    exchange: item.relationships?.dex?.data?.id || "DEX",
                    type: "crypto",
                    ticker: symbolId,
                };
            });

            onResultReadyCallback(formattedResults);
        } catch (error) {
            const defaultSymbols = [
                {
                    symbol: "TURBO",
                    full_name: "TURBO / USD",
                    description: "Turbo",
                },
            ];

            const symbols = [...defaultSymbols, ...customSymbols];
            const filteredSymbols = symbols
                .filter((symbol) =>
                    symbol.full_name.toLowerCase().includes(userInput.toLowerCase())
                )
                .map((symbol) => ({
                    ...symbol,
                    exchange: tokenExchange,
                    type: "crypto",
                }));

            onResultReadyCallback(filteredSymbols);
        }
    }, [network, customSymbols, tokenExchange]);

    const dataFeed = useCallback((
        mainOhlcvData: IOhlcvData[],
        mainTokenDescription: string,
        mainTokenExchange: string
    ): IBasicDataFeed | (IBasicDataFeed & IDatafeedQuotesApi) => {
        return {
            onReady: (callback) => {
                setTimeout(
                    () =>
                        callback({
                            supported_resolutions: [
                                "1S",
                                "10",
                                "15",
                                "30",
                                "60",
                                "240",
                                "480",
                                "720",
                                "1440",
                                "3D",
                                "W",
                                "M",
                            ] as ResolutionString[],
                            supports_marks: true,
                            supports_timescale_marks: true,
                            supports_time: true,
                        }),
                    0
                );
            },
            resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
                const isCompareSymbol = symbolName.includes("_0x");

                let description = mainTokenDescription;
                let exchange = mainTokenExchange;
                let displayName = symbolName;

                if (isCompareSymbol) {
                    const cachedInfo = symbolDataCache.get(`info_${symbolName}`) as any;

                    if (cachedInfo) {
                        description = cachedInfo.description || symbolName;
                        exchange = cachedInfo.exchange || "DEX";
                        displayName = `${description}, ${exchange}`;
                    }
                }

                let dataForPriceScale = mainOhlcvData;

                if (isCompareSymbol) {
                    const parts = symbolName.split("_");
                    const tokenNetwork = parts[0];
                    const tokenAddress = parts.slice(1).join("_");
                    const cacheKey = `${tokenNetwork}_${tokenAddress}`;

                    if (symbolDataCache.has(cacheKey)) {
                        dataForPriceScale = symbolDataCache.get(cacheKey)!;
                    }
                }

                let minPrice = Infinity;
                for (const bar of dataForPriceScale) {
                    if (bar.low > 0 && bar.low < minPrice) {
                        minPrice = bar.low;
                    }
                }

                let priceScale = 100000000;

                if (minPrice !== Infinity && minPrice > 0) {
                    if (minPrice >= 1) {
                        priceScale = 10000;
                    } else {
                        const decimals = Math.ceil(-Math.log10(minPrice)) + 2;
                        const maxDecimals = 16;
                        priceScale = Math.pow(10, Math.min(decimals, maxDecimals));
                    }
                }

                const symbolInfo = {
                    name: displayName,
                    full_name: displayName,
                    description: description,
                    exchange: exchange,
                    timezone: "Etc/UTC"  as Timezone,
                    minmov: 1,
                    session: "24x7",
                    has_intraday: true,
                    type: "crypto",
                    supported_resolutions: [
                        "1S",
                        "10",
                        "15",
                        "30",
                        "60",
                        "240",
                        "480",
                        "720",
                        "1440",
                        "3D",
                        "W",
                        "M",
                    ] as ResolutionString[],
                    pricescale: priceScale,
                    ticker: symbolName,
                    listed_exchange: exchange,
                    format: "price" as SeriesFormat,
                    has_empty_bars: false,
                    volume_precision: 8,
                    daily_multipliers: ["1", "3", "7"],
                };

                setTimeout(() => {
                    onSymbolResolvedCallback(symbolInfo);
                }, 0);
            },
            getBars: async (symbolInfo, resolution, periodParams, onResult, onError) => {
                try {
                    const symbolTicker = symbolInfo.ticker || symbolInfo.name;
                    const isCompareSymbol = symbolTicker.includes("_0x");

                    let targetOhlcvData = mainOhlcvData;

                    if (isCompareSymbol) {
                        const parts = symbolTicker.split("_");
                        const tokenNetwork = parts[0];
                        const poolAddress = parts.slice(1).join("_");

                        targetOhlcvData = await fetchTokenOhlcvData(poolAddress, tokenNetwork);
                    }

                    if (!targetOhlcvData || targetOhlcvData.length === 0) {
                        onResult([], { noData: true });
                        return;
                    }

                    const fromTime = periodParams.from;
                    const toTime = periodParams.to;

                    const filteredData = targetOhlcvData.filter(
                        (bar) => bar.time >= fromTime && bar.time <= toTime
                    );

                    let intervalDays = 1;
                    if (resolution === "3D") intervalDays = 3;
                    else if (resolution === "W") intervalDays = 7;
                    else if (resolution === "M") intervalDays = 30;

                    const needsAggregation = ["3D", "W", "M"].includes(resolution);

                    let bars = [];

                    if (needsAggregation && filteredData.length > 0) {
                        const aggregated: { [key: number]: any } = {};

                        filteredData.forEach((bar) => {
                            const time = bar.time * 1000;
                            const daysSinceEpoch = Math.floor(time / (24 * 60 * 60 * 1000));
                            const periodIndex = Math.floor(daysSinceEpoch / intervalDays);
                            const periodStart = periodIndex * intervalDays * 24 * 60 * 60 * 1000;

                            if (!aggregated[periodStart]) {
                                aggregated[periodStart] = {
                                    time: periodStart,
                                    open: bar.open,
                                    high: bar.high,
                                    low: bar.low,
                                    close: bar.close,
                                    volume: bar.volume,
                                };
                            } else {
                                aggregated[periodStart].high = Math.max(aggregated[periodStart].high, bar.high);
                                aggregated[periodStart].low = Math.min(aggregated[periodStart].low, bar.low);
                                aggregated[periodStart].close = bar.close;
                                aggregated[periodStart].volume += bar.volume;
                            }
                        });

                        bars = Object.values(aggregated).sort((a, b) => a.time - b.time);
                    } else {
                        bars = filteredData.map((bar) => ({
                            time: bar.time * 1000,
                            open: bar.open,
                            high: bar.high,
                            low: bar.low,
                            close: bar.close,
                            volume: bar.volume,
                        }));
                    }

                    if (bars.length) {
                        onResult(bars, { noData: false });
                    } else {
                        onResult([], { noData: true });
                    }
                } catch (error) {
                    console.error("error:", error);
                    onResult([], { noData: true });
                }
            },
            subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscriberUID) => {
                const symbolTicker = symbolInfo.ticker || symbolInfo.name;
                const isCompareSymbol = symbolTicker.includes("_0x");

                if (subscriptionIntervals.has(subscriberUID)) {
                    clearInterval(subscriptionIntervals.get(subscriberUID)!);
                }

                const interval = setInterval(() => {
                    let targetData = mainOhlcvData;

                    if (isCompareSymbol) {
                        const parts = symbolTicker.split("_");
                        const tokenNetwork = parts[0];
                        const tokenAddress = parts.slice(1).join("_");
                        const cacheKey = `${tokenNetwork}_${tokenAddress}`;

                        if (symbolDataCache.has(cacheKey)) {
                            targetData = symbolDataCache.get(cacheKey)!;
                        }
                    }

                    if (targetData && targetData.length > 0) {
                        const lastBar = targetData[targetData.length - 1];
                        const latestBar = {
                            time: lastBar.time * 1000,
                            open: lastBar.open,
                            high: lastBar.high,
                            low: lastBar.low,
                            close: lastBar.close,
                            volume: lastBar.volume,
                        };
                        onRealtimeCallback(latestBar);
                    }
                }, 10000);

                subscriptionIntervals.set(subscriberUID, interval);
            },
            unsubscribeBars: (subscriberUID) => {
                if (subscriptionIntervals.has(subscriberUID)) {
                    clearInterval(subscriptionIntervals.get(subscriberUID)!);
                    subscriptionIntervals.delete(subscriberUID);
                }
            },
            searchSymbols: (
                userInput,
                exchange,
                symbolType,
                onResultReadyCallback
            ) => {
                if (!userInput || userInput.trim().length < 2) {
                    onResultReadyCallback([]);
                    return;
                }


                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                }


                searchDebounceTimer = setTimeout(() => {
                    handleSearch(userInput, onResultReadyCallback);
                }, 2000);
            },
        };
    }, [fetchTokenOhlcvData, handleSearch]);

    useEffect(() => {
        const widgetOptions: ChartingLibraryWidgetOptions = {
            symbol: chartOptions.symbol || "DefaultSymbol",
            datafeed: dataFeed(ohlcvData, tokenDescription, tokenExchange),
            interval:
                (chartOptions.interval as ResolutionString) ||
                ("4H" as ResolutionString),
            container: chartContainerRef.current,
            library_path: chartOptions.library_path,
            locale: "en",
            debug: true,
            disabled_features: [
                "use_localstorage_for_settings",
            ],
            enabled_features: [
                "study_templates",
            ],
            charts_storage_url: chartOptions.charts_storage_url,
            charts_storage_api_version: chartOptions.charts_storage_api_version,
            client_id: chartOptions.client_id,
            user_id: chartOptions.user_id,
            fullscreen: chartOptions.fullscreen,
            autosize: chartOptions.autosize,
            timezone: "Etc/UTC",
            theme: theme || "dark",
            custom_formatters: {
                priceFormatterFactory: () => ({
                    format: (price: number) => {
                        if (price === 0) return "0";

                        const absPrice = Math.abs(price);

                        if (absPrice < 0.0001) {
                            const exponent = Math.floor(Math.log10(absPrice));
                            const adjustedExp = exponent + 2;
                            const mantissa = price * Math.pow(10, -adjustedExp);
                            return `${mantissa.toFixed(5)}e${adjustedExp}`;
                        }

                        if (absPrice >= 1) {
                            return price.toFixed(6);
                        }

                        return price.toFixed(8);
                    },
                }),
            },
        };

        myWidget.current = new TradingViewWidget(widgetOptions);

        return () => {
            subscriptionIntervals.forEach((interval) => clearInterval(interval));
            subscriptionIntervals.clear();
            if (searchDebounceTimer) {
                clearTimeout(searchDebounceTimer);
            }
            myWidget.current.remove();
        };
    }, [pathname]);

    useEffect(() => {
        if (myWidget.current) {
            myWidget.current.onChartReady(() => {
                setChartIsReady(true);

                const chart = myWidget.current.activeChart();

                myWidget.current.headerReady().then(() => {
                    const button = myWidget.current.createButton();
                    button.setAttribute("title", "Compare");
                    button.classList.add("apply-common-tooltip");
                    button.style.cursor = "pointer";
                    button.innerHTML = "Compare";
                    button.addEventListener("click", () => {
                        chart.executeActionById("compareOrAdd");

                    });
                });
            });
        }
    }, [myWidget]);

    useEffect(() => {
        if (chartIsReady) myWidget.current.changeTheme(theme);
    }, [theme, chartIsReady]);

    useEffect(() => {
        if (chartIsReady) {
            myWidget.current._options.datafeed = dataFeed(
                ohlcvData,
                tokenDescription,
                tokenExchange
            );
            myWidget.current.activeChart().resetData();
        }
    }, [ohlcvData, tokenDescription, tokenExchange, chartIsReady, dataFeed]);

    return <div ref={chartContainerRef} className={"TVChartContainer"} />;
};

export default MyTradingView;