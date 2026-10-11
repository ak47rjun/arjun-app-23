//+------------------------------------------------------------------+
//|                                                     ARJUN_EA.mq5 |
//|                                          ARJUN — The Real Trader's Hub |
//|                                                                  |
//|  Read-only Expert Advisor: pushes your account snapshot and closed |
//|  deals to ARJUN for journaling & analytics. It never opens, closes  |
//|  or modifies trades, and it never sees any password — your terminal  |
//|  session is already authenticated with your broker.                 |
//|                                                                  |
//|  SETUP (3 steps):                                                    |
//|  1. In ARJUN → MT5 → Connect account, choose "Expert Advisor" mode,  |
//|     enter your MT5 login + server, and copy the SYNC TOKEN shown.     |
//|  2. In the terminal: Tools → Options → Expert Advisors → enable      |
//|     "Allow WebRequest for listed URL" and add:                       |
//|       https://arjun-production-04c9.up.railway.app                    |
//|  3. Attach this EA to any chart (e.g. EURUSD M15), paste the sync     |
//|     token into InpSyncToken, and click OK. It pushes every           |
//|     InpPushSeconds seconds while the terminal is online.             |
//|                                                                  |
//|  NOTE: times are sent as broker server time (ISO-8601 with Z).      |
//+------------------------------------------------------------------+
#property copyright "ARJUN — The Real Trader's Hub"
#property link      "https://arjun-production-04c9.up.railway.app/mt5"
#property version   "1.00"
#property strict

input string InpArjunUrl   = "https://arjun-production-04c9.up.railway.app/api/mt5/ingest"; // ARJUN ingest URL
input string InpSyncToken  = "";   // Sync token from ARJUN (shown once when you connect — paste it here)
input int    InpPushSeconds = 60;   // Push interval in seconds (min 10)
input int    InpHistoryDays = 30;   // How many days of closed deals to send

datetime g_lastOk = 0;

int OnInit()
{
   if(StringLen(InpSyncToken) < 16)
   {
      Alert("ARJUN EA: paste your ARJUN sync token into InpSyncToken first (ARJUN → MT5 → Connect account → Expert Advisor mode).");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(!TerminalInfoInteger(TERMINAL_WEBREQUEST_ALLOWED))
   {
      Alert("ARJUN EA: WebRequest is disabled. Enable it in Tools → Options → Expert Advisors and allow the ARJUN URL in the list.");
      return(INIT_FAILED);
   }
   EventSetTimer(MathMax(InpPushSeconds, 10));
   PushNow();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   PushNow();
}

//+------------------------------------------------------------------+
//| helpers                                                          |
//+------------------------------------------------------------------+
string IsoTime(datetime t)
{
   MqlDateTime dt;
   if(!TimeToStruct(t, dt)) return("");
   return(StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec));
}

string Num(double v)
{
   return(DoubleToString(v, 8));
}

//+------------------------------------------------------------------+
//| push one snapshot + closed deals                                 |
//+------------------------------------------------------------------+
void PushNow()
{
   // ---- account snapshot ----
   long   login     = AccountInfoInteger(ACCOUNT_LOGIN);
   string payload;
   StringInit(payload, 2 * 1024 * 1024);
   payload  = "{";
   payload += "\"account\":{";
   payload += "\"login\":\""        + IntegerToString(login)                        + "\",";
   payload += "\"balance\":"        + Num(AccountInfoDouble(ACCOUNT_BALANCE))         + ",";
   payload += "\"equity\":"         + Num(AccountInfoDouble(ACCOUNT_EQUITY))          + ",";
   payload += "\"margin\":"         + Num(AccountInfoDouble(ACCOUNT_MARGIN))          + ",";
   payload += "\"freeMargin\":"     + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREEMARGIN)) + ",";
   payload += "\"currency\":\""     + AccountInfoString(ACCOUNT_CURRENCY)             + "\",";
   payload += "\"leverage\":"       + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE));
   payload += "},\"deals\":[";

   // ---- closed deals, aggregated per position (MT5 reports deals, not positions) ----
   datetime from = TimeCurrent() - (datetime)(InpHistoryDays * 86400);
   if(!HistorySelect(from, TimeCurrent()))
      Print("ARJUN EA: HistorySelect failed, err=", GetLastError());

   int total    = HistoryDealsTotal();
   int maxDeals = 20000; // hard cap for very long histories
   int start    = (total > maxDeals) ? (total - maxDeals) : 0;

   long   posId[];    ArrayResize(posId, 0);
   long   outTicket[]; ArrayResize(outTicket, 0);
   string posSym[];   ArrayResize(posSym, 0);
   int    posDir[];   ArrayResize(posDir, 0);    // 0 = buy/long, 1 = sell/short
   double posVol[];   ArrayResize(posVol, 0);
   double posOpen[];  ArrayResize(posOpen, 0);
   datetime posOpenTime[]; ArrayResize(posOpenTime, 0);
   double posClose[]; ArrayResize(posClose, 0);
   datetime posCloseTime[]; ArrayResize(posCloseTime, 0);
   double posProfit[]; ArrayResize(posProfit, 0);
   double posComm[];  ArrayResize(posComm, 0);
   double posSwap[];  ArrayResize(posSwap, 0);

   for(int i = start; i < total; i++)
   {
      long   positionId = HistoryDealGetInteger(i, DEAL_POSITION_ID);
      long   entry      = HistoryDealGetInteger(i, DEAL_ENTRY);
      long   dealType   = HistoryDealGetInteger(i, DEAL_TYPE);
      string symbol     = HistoryDealGetString(i, DEAL_SYMBOL);
      double volume     = HistoryDealGetDouble(i, DEAL_VOLUME);
      double price      = HistoryDealGetDouble(i, DEAL_PRICE);
      datetime dealTime = (datetime)HistoryDealGetInteger(i, DEAL_TIME);

      // find the aggregation slot for this position
      int slot = -1;
      for(int j = 0; j < ArraySize(posId); j++)
         if(posId[j] == positionId) { slot = j; break; }
      if(slot < 0)
      {
         slot = ArraySize(posId);
         ArrayResize(posId, slot + 1);       ArraySetAsSeries(posId, false);
         ArrayResize(outTicket, slot + 1);
         ArrayResize(posSym, slot + 1);
         ArrayResize(posDir, slot + 1);
         ArrayResize(posVol, slot + 1);
         ArrayResize(posOpen, slot + 1);
         ArrayResize(posOpenTime, slot + 1);
         ArrayResize(posClose, slot + 1);
         ArrayResize(posCloseTime, slot + 1);
         ArrayResize(posProfit, slot + 1);
         ArrayResize(posComm, slot + 1);
         ArrayResize(posSwap, slot + 1);
         posId[slot] = positionId; outTicket[slot] = 0;
         posSym[slot] = ""; posDir[slot] = -1; posVol[slot] = 0;
         posOpen[slot] = 0; posOpenTime[slot] = 0;
         posClose[slot] = 0; posCloseTime[slot] = 0;
         posProfit[slot] = 0; posComm[slot] = 0; posSwap[slot] = 0;
      }

      if(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
      {
         posSym[slot]      = symbol;
         posDir[slot]      = (dealType == DEAL_TYPE_BUY) ? 0 : 1;
         posVol[slot]      = volume;
         posOpen[slot]     = price;
         posOpenTime[slot] = dealTime;
      }
      else if(entry == DEAL_ENTRY_OUT)
      {
         outTicket[slot]    = HistoryDealGetInteger(i, DEAL_TICKET);
         posClose[slot]     = price;
         posCloseTime[slot] = dealTime;
         posProfit[slot]    = HistoryDealGetDouble(i, DEAL_PROFIT);
         posComm[slot]      = HistoryDealGetDouble(i, DEAL_COMMISSION);
         posSwap[slot]      = HistoryDealGetDouble(i, DEAL_SWAP);
      }
   }

   // ---- emit positions that have both an open and a close ----
   int emitted = 0;
   for(int s = 0; s < ArraySize(posId); s++)
   {
      if(posDir[s] < 0 || outTicket[s] == 0 || posOpenTime[s] == 0) continue; // not closed yet
      if(emitted > 0) payload += ",";
      payload += "{";
      payload += "\"dealId\":\""   + IntegerToString(outTicket[s]) + "\",";
      payload += "\"symbol\":\""   + posSym[s]                     + "\",";
      payload += "\"direction\":\"" + (posDir[s] == 0 ? "LONG" : "SHORT") + "\",";
      payload += "\"volume\":"      + Num(posVol[s])                + ",";
      payload += "\"openPrice\":"   + Num(posOpen[s])               + ",";
      payload += "\"closePrice\":"  + Num(posClose[s])              + ",";
      payload += "\"openTime\":\""  + IsoTime(posOpenTime[s])       + "\",";
      payload += "\"closeTime\":\"" + IsoTime(posCloseTime[s])      + "\",";
      payload += "\"profit\":"      + Num(posProfit[s])             + ",";
      payload += "\"commission\":"  + Num(posComm[s])               + ",";
      payload += "\"swap\":"        + Num(posSwap[s]);
      payload += "}";
      emitted++;
   }
   payload += "]}";

   // ---- POST to ARJUN ----
   char data[];
   int len = StringLen(payload);
   ArrayResize(data, len + 1);
   StringToCharArray(payload, data, 0, len, CP_UTF8);

   char   result[];
   string resultHeaders;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpSyncToken + "\r\n";

   ResetLastError();
   int code = WebRequest("POST", InpArjunUrl, headers, 15000, data, result, resultHeaders);
   if(code == 200)
   {
      g_lastOk = TimeCurrent();
      Print("ARJUN EA: pushed OK — ", emitted, " closed position(s) in the last ", InpHistoryDays, " day(s).");
   }
   else
   {
      int err = GetLastError();
      Print("ARJUN EA: push failed — http=", code, " err=", err,
            (err == 4014 ? " (the ARJUN URL is not in the allowed WebRequest list — add it in Tools → Options → Expert Advisors)" : ""));
   }
}
//+------------------------------------------------------------------+
