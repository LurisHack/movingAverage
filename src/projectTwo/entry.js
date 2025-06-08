import {dataObject, setObject} from "./dataObject.js";
import {fetchHistoricalCandles} from "./data.js";
import {initialize} from "./btcDenominator.js";

export function projectOneInit(){


    setObject().then(async (symbols) => {

        initialize();


        dataObject.coins = symbols;
        for (let index in dataObject.coins) {
            await fetchHistoricalCandles(index)
        }


    })

}