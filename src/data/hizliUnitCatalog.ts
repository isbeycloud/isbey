/** Hızlı Bilişim GetCodeList(BIRIM) doğrulanmış referans verisi; erişim bilgisi içermez. */
export interface HizliUnitDefinition {
  readonly code: string;
  readonly name: string;
  readonly alternativeNames?: readonly string[];
}

export const HIZLI_UNIT_CATALOG_SOURCE = Object.freeze({
  "sourceUrl": "https://econnect.hizliteknoloji.com.tr/HizliApi/RestApi/GetCodeList?type=BIRIM",
  "environment": "production",
  "fetchedAt": "2026-10-29T16:16:53.267Z",
  "sourceRowCount": 96,
  "unitCount": 95,
  "normalizedCodeWhitespace": [
    "CEN"
  ],
  "normalizedRowsSha256": "e9ddb3119bc84e607c5061b5af3cc880368cadb49bf8792843407eaf9ccb302d"
});

/** Aynı kodun alternatif açıklamaları korunur; seçimde her kod tek kez yer alır. */
export const HIZLI_UNIT_CATALOG: readonly HizliUnitDefinition[] = [
  {
    "code": "B32",
    "name": "KG-METRE KARE"
  },
  {
    "code": "C62",
    "name": "ADET"
  },
  {
    "code": "CCT",
    "name": "TON BAŞINA TAŞIMA KAPASİTESİ"
  },
  {
    "code": "PR",
    "name": "ADET-ÇİFT"
  },
  {
    "code": "D30",
    "name": "BRÜT KALORİ DEĞERİ"
  },
  {
    "code": "D40",
    "name": "BİN LİTRE"
  },
  {
    "code": "GFI",
    "name": "FISSILE İZOTOP GRAMI"
  },
  {
    "code": "GRM",
    "name": "GRAM"
  },
  {
    "code": "GT",
    "name": "GROSS TON"
  },
  {
    "code": "CEN",
    "name": "YÜZ ADET"
  },
  {
    "code": "KPO",
    "name": "KİLOGRAM POTASYUM OKSİT"
  },
  {
    "code": "MND",
    "name": "KURUTULMUŞ NET AĞIRLIKLI KİLOGRAMI"
  },
  {
    "code": "3I",
    "name": "KİLOGRAM-ADET"
  },
  {
    "code": "KGM",
    "name": "KİLOGRAM"
  },
  {
    "code": "KMA",
    "name": "METİL AMİNLERİN KİLOGRAMI"
  },
  {
    "code": "KNI",
    "name": "AZOTUN KİLOGRAMI"
  },
  {
    "code": "KPH",
    "name": "KG POTASYUM OKSİD"
  },
  {
    "code": "KSD",
    "name": "KURU ÜRÜN KİLOGRAMI %90"
  },
  {
    "code": "KSH",
    "name": "SODYUM HİDROKSİT KİLOGRAMI"
  },
  {
    "code": "KUR",
    "name": "URANYUM KİLOGRAMI"
  },
  {
    "code": "KWH",
    "name": "KİLOWATT SAAT"
  },
  {
    "code": "KWT",
    "name": "KİLOWATT"
  },
  {
    "code": "LPA",
    "name": "SAF ALKOL LİTRESİ"
  },
  {
    "code": "LTR",
    "name": "LİTRE"
  },
  {
    "code": "MTK",
    "name": "METRE KARE"
  },
  {
    "code": "MTQ",
    "name": "METRE KÜP"
  },
  {
    "code": "MTR",
    "name": "METRE"
  },
  {
    "code": "NCL",
    "name": "HÜCRE ADEDİ"
  },
  {
    "code": "R9",
    "name": "BİN METRE KÜP"
  },
  {
    "code": "T3",
    "name": "BİN ADET"
  },
  {
    "code": "DRL",
    "name": "RULO"
  },
  {
    "code": "26",
    "name": "TON"
  },
  {
    "code": "SA",
    "name": "ÇUVAL"
  },
  {
    "code": "C68",
    "name": "PUNNET"
  },
  {
    "code": "4H",
    "name": "P.CASES"
  },
  {
    "code": "5H",
    "name": "C.BOXES"
  },
  {
    "code": "BFT",
    "name": "W.CASES"
  },
  {
    "code": "EC",
    "name": "P.BAG"
  },
  {
    "code": "BX",
    "name": "KUTU"
  },
  {
    "code": "BO",
    "name": "ŞİŞE"
  },
  {
    "code": "SL",
    "name": "PALET"
  },
  {
    "code": "SET",
    "name": "SET (TAKIM)"
  },
  {
    "code": "PA",
    "name": "PAKET"
  },
  {
    "code": "CT",
    "name": "KARTON"
  },
  {
    "code": "J57",
    "name": "VARİL"
  },
  {
    "code": "JOU",
    "name": "VARDİYA"
  },
  {
    "code": "MON",
    "name": "AY"
  },
  {
    "code": "HUR",
    "name": "SAAT"
  },
  {
    "code": "D62",
    "name": "SANİYE"
  },
  {
    "code": "ANN",
    "name": "YIL"
  },
  {
    "code": "DAY",
    "name": "GÜN"
  },
  {
    "code": "CL",
    "name": "BOBİN"
  },
  {
    "code": "E27",
    "name": "DOZ"
  },
  {
    "code": "EA",
    "name": "EA"
  },
  {
    "code": "PK",
    "name": "KOLİ(PK) / PAKET(PA)"
  },
  {
    "code": "ST",
    "name": "TBK"
  },
  {
    "code": "MGM",
    "name": "MW"
  },
  {
    "code": "KF",
    "name": "KİLO PAKET"
  },
  {
    "code": "DR",
    "name": "BİDON"
  },
  {
    "code": "1J",
    "name": "TON MİLE"
  },
  {
    "code": "HAR",
    "name": "HEKTAR"
  },
  {
    "code": "LR",
    "name": "TABAKA"
  },
  {
    "code": "BJ",
    "name": "KOVA"
  },
  {
    "code": "DPC",
    "name": "DÜZİNE PARÇA"
  },
  {
    "code": "DPR",
    "name": "DÜZİNE ÇİFT"
  },
  {
    "code": "KTM",
    "name": "KİLOMETRE"
  },
  {
    "code": "MIN",
    "name": "DAKİKA"
  },
  {
    "code": "MAW",
    "name": "MEGAWATT"
  },
  {
    "code": "MWH",
    "name": "MEGAWATT SAAT",
    "alternativeNames": [
      "MEGAWATT SAAT (1000 kW.h)"
    ]
  },
  {
    "code": "TL",
    "name": "TL"
  },
  {
    "code": "WEE",
    "name": "HAFTA"
  },
  {
    "code": "CMQ",
    "name": "CM3"
  },
  {
    "code": "MMT",
    "name": "MM"
  },
  {
    "code": "TC",
    "name": "KAMYON"
  },
  {
    "code": "CH",
    "name": "KONTEYNIR"
  },
  {
    "code": "BG",
    "name": "TORBA"
  },
  {
    "code": "ACR",
    "name": "DÖNÜM"
  },
  {
    "code": "TNE",
    "name": "TON"
  },
  {
    "code": "CR",
    "name": "SANDIK"
  },
  {
    "code": "NIU",
    "name": "ADET"
  },
  {
    "code": "TN",
    "name": "TENEKE"
  },
  {
    "code": "PG",
    "name": "PLAKA"
  },
  {
    "code": "MLT",
    "name": "MİLİLİTRE"
  },
  {
    "code": "GLL",
    "name": "GALON"
  },
  {
    "code": "G26",
    "name": "STER"
  },
  {
    "code": "CMK",
    "name": "SANTİMETRE KARE"
  },
  {
    "code": "CMT",
    "name": "SANTİMETRE"
  },
  {
    "code": "DZN",
    "name": "DÜZİNE"
  },
  {
    "code": "CTM",
    "name": "KARAT"
  },
  {
    "code": "KFO",
    "name": "DİFOSFOR PENTAOKSİT KİLOGRAMI"
  },
  {
    "code": "KHY",
    "name": "HİDROJEN PEROKSİT KİLOGRAMI"
  },
  {
    "code": "D32",
    "name": "TERAWATT SAAT"
  },
  {
    "code": "GWH",
    "name": "GİGAWATT SAAT"
  },
  {
    "code": "DMK",
    "name": "DESİMETRE KARE"
  },
  {
    "code": "SM3",
    "name": "STANDART METREKÜP"
  }
];
