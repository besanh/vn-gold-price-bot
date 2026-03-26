export type GoldItem = {
    source: string;
    type: string;
    name: string;
    buy: number;
    sell: number;
    change_sell: number;
    delta: number;
    time: string;
    date: string;
};

export type HistoryData = Record<string, { t: number, p: number }[]>;
