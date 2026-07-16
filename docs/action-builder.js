(() => {
  "use strict";

  const EVENT_GROUPS = [
    {
      label: "Startup & session",
      events: [
        "Cargo", "ClearSavedGame", "Commander", "EngineerProgress", "Fileheader",
        "LoadGame", "Loadout", "Materials", "Missions", "NewCommander",
        "Passengers", "Powerplay", "Progress", "Rank", "Reputation", "Shutdown",
        "SquadronStartup", "Statistics"
      ]
    },
    {
      label: "Travel",
      events: [
        "ApproachBody", "ApproachSettlement", "CarrierJump", "Docked",
        "DockingCancelled", "DockingDenied", "DockingGranted", "DockingRequested",
        "DockingTimeout", "FSDJump", "FSDTarget", "LeaveBody", "Liftoff",
        "Location", "NavRoute", "NavRouteClear", "StartJump",
        "SupercruiseDestinationDrop", "SupercruiseEntry", "SupercruiseExit",
        "Touchdown", "Undocked"
      ]
    },
    {
      label: "Combat",
      events: [
        "Bounty", "CapShipBond", "Died", "EscapeInterdiction", "FactionKillBond",
        "FighterDestroyed", "FighterRebuilt", "HeatDamage", "HeatWarning",
        "HullDamage", "Interdicted", "Interdiction", "PVPKill", "ShieldState",
        "ShipTargeted", "SRVDestroyed", "UnderAttack"
      ]
    },
    {
      label: "Exploration",
      events: [
        "BuyExplorationData", "CodexEntry", "DiscoveryScan", "FSSAllBodiesFound",
        "FSSBodySignals", "FSSDiscoveryScan", "FSSSignalDiscovered",
        "MaterialCollected", "MaterialDiscarded", "MaterialDiscovered",
        "MultiSellExplorationData", "NavBeaconScan", "SAAScanComplete",
        "SAASignalsFound", "Scan", "ScanBaryCentre", "Screenshot",
        "SellExplorationData"
      ]
    },
    {
      label: "Trade & mining",
      events: [
        "AsteroidCracked", "BuyTradeData", "CollectCargo", "EjectCargo",
        "MarketBuy", "MarketSell", "MiningRefined"
      ]
    },
    {
      label: "Station services",
      events: [
        "BuyAmmo", "BuyDrones", "CargoDepot", "ClearImpound", "CommunityGoal",
        "CommunityGoalDiscard", "CommunityGoalJoin", "CommunityGoalReward",
        "CrewAssign", "CrewFire", "CrewHire", "EngineerContribution",
        "EngineerCraft", "FetchRemoteModule", "Market", "MassModuleStore",
        "MaterialTrade", "MissionAbandoned", "MissionAccepted",
        "MissionCompleted", "MissionFailed", "MissionRedirected", "ModuleBuy",
        "ModuleRetrieve", "ModuleSell", "ModuleSellRemote", "ModuleStore",
        "ModuleSwap", "Outfitting", "PayBounties", "PayFines", "RedeemVoucher",
        "RefuelAll", "RefuelPartial", "Repair", "RepairAll", "RestockVehicle",
        "ScientificResearch", "SearchAndRescue", "SellDrones", "SetUserShipName",
        "Shipyard", "ShipyardBuy", "ShipyardNew", "ShipyardSell", "ShipyardSwap",
        "ShipyardTransfer", "StoredModules", "StoredShips", "TechnologyBroker"
      ]
    },
    {
      label: "Powerplay, squadrons & carriers",
      events: [
        "PowerplayCollect", "PowerplayDefect", "PowerplayDeliver",
        "PowerplayFastTrack", "PowerplayJoin", "PowerplayLeave",
        "PowerplaySalary", "PowerplayVote", "PowerplayVoucher",
        "AppliedToSquadron", "DisbandedSquadron", "InvitedToSquadron",
        "JoinedSquadron", "KickedFromSquadron", "LeftSquadron",
        "SquadronCreated", "SquadronDemotion", "SquadronPromotion",
        "CarrierBankTransfer", "CarrierBuy", "CarrierCancelDecommission",
        "CarrierCrewServices", "CarrierDecommission", "CarrierDepositFuel",
        "CarrierDockingPermission", "CarrierFinance", "CarrierJumpCancelled",
        "CarrierJumpRequest", "CarrierModulePack", "CarrierNameChange",
        "CarrierShipPack", "CarrierStats", "CarrierTradeOrder"
      ]
    },
    {
      label: "On foot (Odyssey)",
      events: [
        "Backpack", "BackpackChange", "BookDropship", "BookTaxi",
        "BuyMicroResources", "BuySuit", "BuyWeapon", "CancelDropship",
        "CancelTaxi", "CollectItems", "CreateSuitLoadout", "DeleteSuitLoadout",
        "Disembark", "DropItems", "DropshipDeploy", "Embark", "FCMaterials",
        "LoadoutEquipModule", "LoadoutRemoveModule", "RenameSuitLoadout",
        "ScanOrganic", "SellMicroResources", "SellOrganicData", "SellSuit",
        "SellWeapon", "ShipLocker", "SuitLoadout", "SwitchSuitLoadout",
        "TradeMicroResources", "TransferMicroResources", "UpgradeSuit",
        "UpgradeWeapon", "UseConsumable"
      ]
    },
    {
      label: "Other journal events",
      events: [
        "AfmuRepairs", "CargoTransfer", "ChangeCrewRole", "CockpitBreached",
        "CommitCrime", "Continued", "CrewLaunchFighter", "CrewMemberJoins",
        "CrewMemberQuits", "CrewMemberRoleChange", "CrimeVictim", "DatalinkScan",
        "DatalinkVoucher", "DataScanned", "DockFighter", "DockSRV",
        "EndCrewSession", "Friends", "FuelScoop", "JetConeBoost",
        "JetConeDamage", "JoinACrew", "KickCrewMember", "LaunchDrone",
        "LaunchFighter", "LaunchSRV", "ModuleInfo", "Music", "NpcCrewPaidWage",
        "NpcCrewRank", "Promotion", "ProspectedAsteroid", "QuitACrew",
        "RebootRepair", "ReceiveText", "RepairDrone", "ReservoirReplenished",
        "Resurrect", "SelfDestruct", "SendText", "Synthesis", "SystemsShutdown",
        "USSDrop", "VehicleSwitch", "WingAdd", "WingInvite", "WingJoin",
        "WingLeave"
      ]
    }
  ];

  const SHIP_FLAGS = [
    "Docked", "Landed", "LandingGearDown", "ShieldsUp", "Supercruise",
    "FlightAssistOff", "HardpointsDeployed", "InWing", "LightsOn",
    "CargoScoopDeployed", "SilentRunning", "ScoopingFuel", "SrvHandbrake",
    "SrvUsingTurretView", "SrvTurretRetracted", "SrvDriveAssist",
    "FsdMassLocked", "FsdCharging", "FsdCooldown", "LowFuel", "Overheating",
    "HasLatLong", "InDanger", "BeingInterdicted", "InMainShip", "InFighter",
    "InSRV", "AnalysisMode", "NightVision", "AltitudeFromAverageRadius",
    "FsdJump", "SrvHighBeam"
  ];

  const ON_FOOT_FLAGS = [
    "OnFoot", "InTaxi", "InMulticrew", "OnFootInStation", "OnFootOnPlanet",
    "AimDownSight", "LowOxygen", "LowHealth", "Cold", "Hot", "VeryCold",
    "VeryHot", "GlideMode", "OnFootInHangar", "OnFootSocialSpace",
    "OnFootExterior", "BreathableAtmosphere", "TelepresenceMulticrew",
    "PhysicalMulticrew", "FsdHyperdriveCharging"
  ];

  const COMPANION_FILES = [
    "Any file", "Backpack", "Cargo", "FCMaterials", "Market", "Materials",
    "ModulesInfo", "NavRoute", "Outfitting", "ShipLocker", "Shipyard",
    "StoredModules", "StoredShips"
  ];

  const WATCHER_STATUSES = [
    { value: "any", label: "Any status" },
    { value: "started", label: "Started" },
    { value: "hydrated", label: "Hydrated" },
    { value: "journal_changed", label: "Journal changed" },
    { value: "stopped", label: "Stopped" },
    { value: "error", label: "Error" }
  ];

  const EXTERNAL_TRIGGER_KINDS = [
    { value: "twitch-command", label: "Twitch command" },
    { value: "youtube-command", label: "YouTube command" },
    { value: "hotkey", label: "Hotkey or keyboard shortcut" },
    { value: "timer", label: "Timer" },
    { value: "stream-deck", label: "Stream Deck button" },
    { value: "other", label: "Other Streamer.bot trigger" }
  ];

  const EVENT_FIELDS = {
    Docked: [
      field("StationName", "Station name", "string", "The station just docked at."),
      field("StationType", "Station type", "string", "Coriolis, Outpost, FleetCarrier, and similar values."),
      field("StarSystem", "Star system", "string", "The system containing the station."),
      field("MarketID", "Market ID", "number", "The station's numeric market ID."),
      field("StationFaction_Name", "Station faction name", "string", "Nested StationFaction.Name, flattened with an underscore."),
      field("StationGovernment_Localised", "Station government", "string", "Localized government name."),
      field("StationEconomy_Localised", "Station economy", "string", "Localized primary economy."),
      field("DistFromStarLS", "Distance from star", "number", "Distance from the arrival star in light-seconds.")
    ],
    Undocked: [
      field("StationName", "Station name", "string", "The station just left."),
      field("MarketID", "Market ID", "number", "The station's numeric market ID."),
      field("Taxi", "Was in a taxi", "boolean", "True when the event came from an Apex taxi."),
      field("Multicrew", "Was in multicrew", "boolean", "True when the event came from multicrew.")
    ],
    FSDJump: [
      field("StarSystem", "Destination system", "string", "The system just entered."),
      field("JumpDist", "Jump distance", "number", "Distance of this jump in light-years."),
      field("FuelUsed", "Fuel used", "number", "Fuel consumed by this jump."),
      field("FuelLevel", "Fuel remaining", "number", "Main-tank fuel after the jump."),
      field("RemainingJumpsInRoute", "Remaining route jumps", "number", "Jumps left in the plotted route, when supplied."),
      field("SystemFaction_Name", "System faction name", "string", "Nested SystemFaction.Name."),
      field("SystemAllegiance", "System allegiance", "string", "Federation, Empire, Alliance, Independent, or empty."),
      field("SystemEconomy_Localised", "System economy", "string", "Localized primary economy."),
      field("SystemSecurity_Localised", "System security", "string", "Localized security level.")
    ],
    StartJump: [
      field("JumpType", "Jump type", "string", "Hyperspace or Supercruise."),
      field("StarSystem", "Target system", "string", "Destination when starting a hyperspace jump."),
      field("StarClass", "Target star class", "string", "The target system's main star class.")
    ],
    FSDTarget: [
      field("Name", "Target system", "string", "The selected hyperspace target."),
      field("RemainingJumpsInRoute", "Remaining route jumps", "number", "Jumps left in the plotted route.")
    ],
    Location: [
      field("StarSystem", "Current system", "string", "The current star system."),
      field("Docked", "Currently docked", "boolean", "Whether the commander loaded in while docked."),
      field("StationName", "Station name", "string", "Present when docked."),
      field("StationType", "Station type", "string", "Present when docked."),
      field("Body", "Body name", "string", "Current or nearby body, when supplied.")
    ],
    SupercruiseEntry: [
      field("StarSystem", "Star system", "string", "The system in which supercruise started.")
    ],
    SupercruiseExit: [
      field("StarSystem", "Star system", "string", "The current system."),
      field("Body", "Destination body", "string", "The body or location dropped near."),
      field("BodyType", "Body type", "string", "Planet, Star, Station, and similar values.")
    ],
    Touchdown: [
      field("PlayerControlled", "Player controlled", "boolean", "Whether the player controlled the landing."),
      field("Latitude", "Latitude", "number", "Landing latitude."),
      field("Longitude", "Longitude", "number", "Landing longitude."),
      field("NearestDestination", "Nearest destination", "string", "Nearest named location, when supplied.")
    ],
    Liftoff: [
      field("PlayerControlled", "Player controlled", "boolean", "Whether the player controlled the liftoff."),
      field("Latitude", "Latitude", "number", "Liftoff latitude."),
      field("Longitude", "Longitude", "number", "Liftoff longitude."),
      field("NearestDestination", "Nearest destination", "string", "Nearest named location, when supplied.")
    ],
    Bounty: [
      field("TotalReward", "Total reward", "number", "Combined bounty reward in credits."),
      field("Target", "Target name", "string", "Raw internal target name."),
      field("Target_Localised", "Target name (localized)", "string", "Display-friendly target name, when supplied."),
      field("VictimFaction", "Victim faction", "string", "Faction of the destroyed target."),
      field("SharedWithOthers", "Shared with wing", "boolean", "Whether the reward was shared.")
    ],
    Interdicted: [
      field("Submitted", "Submitted", "boolean", "Whether the commander submitted to the interdiction."),
      field("Interdictor", "Interdictor", "string", "Name of the interdicting ship or commander."),
      field("IsPlayer", "Interdictor is player", "boolean", "True when another player interdicted you."),
      field("CombatRank", "Combat rank", "number", "Interdictor combat rank, when supplied."),
      field("Faction", "Faction", "string", "Interdictor faction, when supplied."),
      field("Power", "Power", "string", "Powerplay power, when supplied.")
    ],
    Interdiction: [
      field("Success", "Succeeded", "boolean", "Whether your interdiction succeeded."),
      field("Interdicted", "Target name", "string", "The target you interdicted."),
      field("IsPlayer", "Target is player", "boolean", "True when the target was another player."),
      field("CombatRank", "Combat rank", "number", "Target combat rank, when supplied."),
      field("Faction", "Faction", "string", "Target faction, when supplied.")
    ],
    Died: [
      field("KillerName", "Killer name", "string", "Raw killer name for a single killer."),
      field("KillerName_Localised", "Killer name (localized)", "string", "Display-friendly killer name."),
      field("KillerShip", "Killer ship", "string", "Ship used by the killer."),
      field("KillerRank", "Killer rank", "string", "Combat rank of the killer.")
    ],
    HullDamage: [
      field("Health", "Hull health", "number", "Hull health from 0 to 1."),
      field("PlayerPilot", "Player pilot", "boolean", "Whether the player was piloting.")
    ],
    ShipTargeted: [
      field("TargetLocked", "Target locked", "boolean", "Whether a target is currently locked."),
      field("Ship", "Ship type", "string", "Raw ship type."),
      field("Ship_Localised", "Ship type (localized)", "string", "Display-friendly ship type."),
      field("ScanStage", "Scan stage", "number", "Target scan completion stage."),
      field("PilotName", "Pilot name", "string", "Raw pilot name."),
      field("PilotName_Localised", "Pilot name (localized)", "string", "Display-friendly pilot name."),
      field("LegalStatus", "Legal status", "string", "Clean, Wanted, Lawless, and similar values."),
      field("HullHealth", "Target hull health", "number", "Target hull health from 0 to 1."),
      field("ShieldHealth", "Target shield health", "number", "Target shield health from 0 to 1.")
    ],
    UnderAttack: [
      field("Target", "Attack target", "string", "The thing being attacked, when supplied.")
    ],
    FuelScoop: [
      field("Scooped", "Fuel scooped", "number", "Fuel added by this update."),
      field("Total", "Total fuel", "number", "Current total fuel.")
    ],
    MissionAccepted: [
      field("MissionID", "Mission ID", "number", "Unique mission ID."),
      field("Name", "Mission name", "string", "Raw mission name."),
      field("LocalisedName", "Mission name (localized)", "string", "Display-friendly mission name."),
      field("Faction", "Issuing faction", "string", "Faction that issued the mission."),
      field("DestinationSystem", "Destination system", "string", "Mission destination system, when supplied."),
      field("DestinationStation", "Destination station", "string", "Mission destination station, when supplied."),
      field("Reward", "Reward", "number", "Credit reward, when supplied.")
    ],
    MissionCompleted: [
      field("MissionID", "Mission ID", "number", "Unique mission ID."),
      field("Name", "Mission name", "string", "Raw mission name."),
      field("LocalisedName", "Mission name (localized)", "string", "Display-friendly mission name."),
      field("Faction", "Issuing faction", "string", "Faction that issued the mission."),
      field("Reward", "Reward", "number", "Credit reward."),
      field("Donation", "Donation", "number", "Donation amount, when supplied."),
      field("DestinationSystem", "Destination system", "string", "Mission destination system, when supplied."),
      field("DestinationStation", "Destination station", "string", "Mission destination station, when supplied.")
    ],
    MissionFailed: [
      field("MissionID", "Mission ID", "number", "Unique mission ID."),
      field("Name", "Mission name", "string", "Raw mission name."),
      field("LocalisedName", "Mission name (localized)", "string", "Display-friendly mission name.")
    ],
    Scan: [
      field("BodyName", "Body name", "string", "Name of the scanned body."),
      field("BodyID", "Body ID", "number", "Body ID within the system."),
      field("StarSystem", "Star system", "string", "System containing the body."),
      field("DistanceFromArrivalLS", "Distance from arrival", "number", "Distance from system arrival in light-seconds."),
      field("ScanType", "Scan type", "string", "AutoScan, Detailed, NavBeaconDetail, and similar values."),
      field("StarType", "Star type", "string", "Present for stars."),
      field("PlanetClass", "Planet class", "string", "Present for planets."),
      field("TerraformState", "Terraform state", "string", "Terraformable, Terraforming, Terraformed, or empty."),
      field("Landable", "Landable", "boolean", "Whether the body can be landed on."),
      field("WasDiscovered", "Previously discovered", "boolean", "Whether another commander had discovered it."),
      field("WasMapped", "Previously mapped", "boolean", "Whether another commander had mapped it.")
    ],
    MaterialCollected: [
      field("Category", "Material category", "string", "Raw, Manufactured, or Encoded."),
      field("Name", "Material name", "string", "Raw material identifier."),
      field("Name_Localised", "Material name (localized)", "string", "Display-friendly material name."),
      field("Count", "Count", "number", "Amount collected.")
    ],
    MarketBuy: [
      field("Type", "Commodity", "string", "Raw commodity name."),
      field("Type_Localised", "Commodity (localized)", "string", "Display-friendly commodity name."),
      field("Count", "Count", "number", "Units bought."),
      field("BuyPrice", "Buy price", "number", "Price per unit."),
      field("TotalCost", "Total cost", "number", "Total credits spent.")
    ],
    MarketSell: [
      field("Type", "Commodity", "string", "Raw commodity name."),
      field("Type_Localised", "Commodity (localized)", "string", "Display-friendly commodity name."),
      field("Count", "Count", "number", "Units sold."),
      field("SellPrice", "Sell price", "number", "Price per unit."),
      field("TotalSale", "Total sale", "number", "Total credits received."),
      field("AvgPricePaid", "Average price paid", "number", "Average acquisition price."),
      field("IllegalGoods", "Illegal goods", "boolean", "Whether the goods were illegal."),
      field("StolenGoods", "Stolen goods", "boolean", "Whether the goods were stolen."),
      field("BlackMarket", "Black market", "boolean", "Whether the sale used a black market.")
    ],
    CollectCargo: [
      field("Type", "Cargo type", "string", "Raw commodity name."),
      field("Type_Localised", "Cargo type (localized)", "string", "Display-friendly commodity name."),
      field("Stolen", "Stolen", "boolean", "Whether the cargo is stolen."),
      field("MissionID", "Mission ID", "number", "Related mission ID, when supplied.")
    ],
    EjectCargo: [
      field("Type", "Cargo type", "string", "Raw commodity name."),
      field("Type_Localised", "Cargo type (localized)", "string", "Display-friendly commodity name."),
      field("Count", "Count", "number", "Units ejected."),
      field("Abandoned", "Abandoned", "boolean", "Whether ownership was abandoned."),
      field("MissionID", "Mission ID", "number", "Related mission ID, when supplied.")
    ],
    MiningRefined: [
      field("Type", "Refined material", "string", "Raw commodity name."),
      field("Type_Localised", "Refined material (localized)", "string", "Display-friendly commodity name.")
    ],
    RedeemVoucher: [
      field("Type", "Voucher type", "string", "Bounty, CombatBond, and similar values."),
      field("Amount", "Amount", "number", "Credits redeemed."),
      field("Faction", "Faction", "string", "Related faction, when supplied.")
    ],
    SellExplorationData: [
      field("TotalEarnings", "Total earnings", "number", "Credits earned from the sale."),
      field("BaseValue", "Base value", "number", "Base exploration value."),
      field("Bonus", "Bonus", "number", "First-discovery or efficiency bonus.")
    ],
    ScanOrganic: [
      field("ScanType", "Scan type", "string", "Log, Sample, or Analyse."),
      field("Genus", "Genus", "string", "Raw biological genus."),
      field("Genus_Localised", "Genus (localized)", "string", "Display-friendly genus."),
      field("Species", "Species", "string", "Raw biological species."),
      field("Species_Localised", "Species (localized)", "string", "Display-friendly species.")
    ],
    ReceiveText: [
      field("From", "Sender", "string", "Raw sender name."),
      field("From_Localised", "Sender (localized)", "string", "Display-friendly sender name."),
      field("Message", "Message", "string", "Raw message text."),
      field("Message_Localised", "Message (localized)", "string", "Display-friendly message text."),
      field("Channel", "Channel", "string", "Local, Wing, NPC, Squadron, and similar values.")
    ],
    SendText: [
      field("To", "Recipient", "string", "Message recipient or channel."),
      field("Message", "Message", "string", "Sent message text."),
      field("Sent", "Sent successfully", "boolean", "Whether the message was sent.")
    ],
    Screenshot: [
      field("Filename", "Filename", "string", "Saved screenshot filename."),
      field("Width", "Width", "number", "Image width."),
      field("Height", "Height", "number", "Image height."),
      field("System", "System", "string", "Current system."),
      field("Body", "Body", "string", "Current body, when supplied."),
      field("Latitude", "Latitude", "number", "Position latitude, when supplied."),
      field("Longitude", "Longitude", "number", "Position longitude, when supplied."),
      field("Altitude", "Altitude", "number", "Altitude, when supplied."),
      field("Heading", "Heading", "number", "Heading, when supplied.")
    ],
    LoadGame: [
      field("Commander", "Commander", "string", "Commander name."),
      field("Ship", "Ship", "string", "Raw ship type."),
      field("Ship_Localised", "Ship (localized)", "string", "Display-friendly ship type."),
      field("ShipName", "Ship name", "string", "Player-assigned ship name."),
      field("GameMode", "Game mode", "string", "Open, Solo, or Group."),
      field("Credits", "Credit balance", "number", "Commander balance at load."),
      field("Loan", "Loan balance", "number", "Outstanding loan.")
    ]
  };

  const GLOBAL_GROUPS = [
    {
      label: "Commander & location",
      variables: [
        variable("global:edCmdr", "~edCmdr~", "Commander name", "string", "Current commander."),
        variable("global:edShip", "~edShip~", "Ship model", "string", "Current ship model."),
        variable("global:edShipName", "~edShipName~", "Ship name", "string", "Player-assigned ship name."),
        variable("global:edSystem", "~edSystem~", "Current star system", "string", "Live system name."),
        variable("global:edStation", "~edStation~", "Current station", "string", "Station name; empty when not docked."),
        variable("global:edLastEvent", "~edLastEvent~", "Latest journal event", "string", "Name of the most recently processed event.")
      ]
    },
    {
      label: "Session totals",
      variables: [
        variable("global:edJumps", "~edJumps~", "Session jumps", "number", "Hyperspace jumps this session."),
        variable("global:edDistanceLy", "~edDistanceLy~", "Distance travelled", "number", "Light-years travelled this session."),
        variable("global:edCreditsEarned", "~edCreditsEarned~", "Credits earned", "number", "Tracked earnings this session."),
        variable("global:edBounties", "~edBounties~", "Bounties collected", "number", "Bounty count this session."),
        variable("global:edBountyEarnings", "~edBountyEarnings~", "Bounty earnings", "number", "Credits from bounties this session."),
        variable("global:edMissionsCompleted", "~edMissionsCompleted~", "Missions completed", "number", "Completed missions this session."),
        variable("global:edDeaths", "~edDeaths~", "Deaths", "number", "Ship losses this session."),
        variable("global:edInterdictions", "~edInterdictions~", "Interdictions", "number", "Times interdicted this session."),
        variable("global:edBodiesScanned", "~edBodiesScanned~", "Bodies scanned", "number", "Scanned bodies this session."),
        variable("global:edFirstDiscoveries", "~edFirstDiscoveries~", "First discoveries", "number", "First discoveries among scanned bodies.")
      ]
    },
    {
      label: "Live cockpit & on-foot values",
      variables: [
        variable("global:edPipsSys", "~edPipsSys~", "SYS pips", "number", "Live SYS pips from 0 to 4."),
        variable("global:edPipsEng", "~edPipsEng~", "ENG pips", "number", "Live ENG pips from 0 to 4."),
        variable("global:edPipsWep", "~edPipsWep~", "WEP pips", "number", "Live WEP pips from 0 to 4."),
        variable("global:edFireGroup", "~edFireGroup~", "Fire group", "number", "Selected fire group, zero-based."),
        variable("global:edGuiFocusName", "~edGuiFocusName~", "Focused panel", "string", "Current cockpit or map panel name."),
        variable("global:edFuelLevel", "~edFuelLevel~", "Main fuel level", "number", "Main-tank fuel in tons."),
        variable("global:edFuelReservoir", "~edFuelReservoir~", "Fuel reservoir", "number", "Reservoir fuel in tons."),
        variable("global:edCargoTons", "~edCargoTons~", "Cargo tons", "number", "Live cargo amount from Status.json."),
        variable("global:edCargoUsed", "~edCargoUsed~", "Cargo units used", "number", "Cargo count from Cargo.json."),
        variable("global:edLegalState", "~edLegalState~", "Legal state", "string", "Clean, Wanted, Speeding, and similar values."),
        variable("global:edBalance", "~edBalance~", "Credit balance", "number", "Current credit balance."),
        variable("global:edLatitude", "~edLatitude~", "Latitude", "number", "Current latitude when near a body."),
        variable("global:edLongitude", "~edLongitude~", "Longitude", "number", "Current longitude when near a body."),
        variable("global:edHeading", "~edHeading~", "Heading", "number", "Current heading."),
        variable("global:edAltitude", "~edAltitude~", "Altitude", "number", "Current altitude."),
        variable("global:edBodyName", "~edBodyName~", "Body name", "string", "Current or nearby body."),
        variable("global:edOxygen", "~edOxygen~", "Oxygen", "number", "On-foot oxygen from 0 to 1."),
        variable("global:edHealth", "~edHealth~", "Health", "number", "On-foot health from 0 to 1."),
        variable("global:edTemperature", "~edTemperature~", "Temperature", "number", "Current on-foot temperature."),
        variable("global:edGravity", "~edGravity~", "Gravity", "number", "Current local gravity."),
        variable("global:edSelectedWeapon", "~edSelectedWeapon~", "Selected weapon", "string", "Currently drawn weapon or tool."),
        variable("global:edDestinationName", "~edDestinationName~", "Locked destination", "string", "Current locked destination name.")
      ]
    },
    {
      label: "Navigation",
      variables: [
        variable("global:edNavTargetSystem", "~edNavTargetSystem~", "Next route system", "string", "Current route target."),
        variable("global:edNavDestination", "~edNavDestination~", "Route destination", "string", "Final system in the plotted route."),
        variable("global:edNavRemainingJumps", "~edNavRemainingJumps~", "Remaining jumps", "number", "Jumps left in the plotted route.")
      ]
    },
    {
      label: "Ship flags",
      variables: SHIP_FLAGS.map((name) =>
        variable(`global:ed${name}`, `~ed${name}~`, splitCamel(name), "boolean", `Live ${splitCamel(name).toLowerCase()} flag.`)
      )
    },
    {
      label: "On-foot flags",
      variables: ON_FOOT_FLAGS.map((name) =>
        variable(`global:ed${name}`, `~ed${name}~`, splitCamel(name), "boolean", `Live ${splitCamel(name).toLowerCase()} flag.`)
      )
    }
  ];

  const OUTCOME_TYPES = [
    { value: "sound", label: "Play a sound" },
    { value: "tts", label: "Speak text (Speaker.bot)" },
    { value: "chat", label: "Send a chat message" },
    { value: "obs", label: "Show, hide, or toggle an OBS source" },
    { value: "run-action", label: "Run another Streamer.bot action" },
    { value: "keyboard", label: "Press a keyboard key" },
    { value: "custom", label: "Another sub-action" }
  ];

  const STRING_OPERATORS = [
    "Equals (Ignore Case)",
    "Not Equals (Ignore Case)",
    "Equals",
    "Not Equals",
    "Contains",
    "Regex Match",
    "Is Null or Empty"
  ];
  const NUMBER_OPERATORS = ["Greater Than", "Less Than", "Equals", "Not Equals"];
  const BOOLEAN_OPERATORS = ["Equals", "Not Equals"];

  let nextId = 1;
  let eventSearchTerm = "";
  let activePreset = "docked-station";
  let copyStatusTimer = null;
  let state = loadSharedState() || createPreset("docked-station");

  const elements = {
    triggerConfig: document.getElementById("trigger-config"),
    automaticConditions: document.getElementById("automatic-conditions"),
    conditionsList: document.getElementById("conditions-list"),
    outcomesList: document.getElementById("outcomes-list"),
    recipeSentence: document.getElementById("recipe-sentence"),
    previewSummary: document.getElementById("preview-summary"),
    actionTree: document.getElementById("action-tree"),
    buildStatus: document.getElementById("build-status"),
    buildNotices: document.getElementById("build-notices"),
    setupSteps: document.getElementById("setup-steps"),
    usedVariables: document.getElementById("used-variables"),
    availableVariables: document.getElementById("available-variables"),
    copyStatus: document.getElementById("copy-status"),
    actionName: document.getElementById("action-name")
  };

  normalizeState();
  renderAll();

  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("click", handleClick);

  function field(name, label, type, description) {
    return { name, label, type, description };
  }

  function variable(key, token, label, type, description, source = "Persisted global") {
    return { key, token, label, type, description, source };
  }

  function uid() {
    return nextId++;
  }

  function splitCamel(value) {
    return value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/^./, (char) => char.toUpperCase());
  }

  function defaultTrigger(overrides = {}) {
    return {
      type: "journal",
      event: "Docked",
      flag: "Docked",
      edge: "on",
      companion: "Cargo",
      watcherStatus: "error",
      externalKind: "twitch-command",
      externalLabel: "!whereami",
      ...overrides
    };
  }

  function newCondition(variableKey = "global:edSystem", operator = "Equals (Ignore Case)", value = "") {
    return {
      id: uid(),
      variableKey,
      customName: "",
      customType: "string",
      operator,
      value,
      autoType: true
    };
  }

  function newOutcome(type = "sound") {
    return {
      id: uid(),
      type,
      file: "",
      volume: "100",
      wait: true,
      message: "",
      platform: "Twitch",
      scene: "",
      source: "",
      obsState: "Visible",
      actionName: "",
      key: "",
      searchName: "",
      notes: ""
    };
  }

  function createPreset(name) {
    switch (name) {
      case "jump-tts": {
        const outcome = newOutcome("tts");
        outcome.message = "Arrived in %edEvent_StarSystem%. Jump ~edJumps~ of this session, with ~edNavRemainingJumps~ remaining.";
        return {
          version: 1,
          actionName: "ED Jump Arrival TTS",
          trigger: defaultTrigger({ type: "journal", event: "FSDJump" }),
          conditions: [],
          outcomes: [outcome]
        };
      }
      case "low-fuel": {
        const outcome = newOutcome("sound");
        outcome.file = "C:\\Sounds\\low-fuel.wav";
        return {
          version: 1,
          actionName: "ED Low Fuel Warning",
          trigger: defaultTrigger({ type: "flag", flag: "LowFuel", edge: "on" }),
          conditions: [],
          outcomes: [outcome]
        };
      }
      case "big-bounty": {
        const condition = newCondition("arg:edEvent_TotalReward", "Greater Than", "250000");
        const outcome = newOutcome("chat");
        outcome.message = "Bounty collected: %edEvent_TotalReward% CR from %edEvent_Target_Localised%.";
        return {
          version: 1,
          actionName: "ED Big Bounty",
          trigger: defaultTrigger({ type: "journal", event: "Bounty" }),
          conditions: [condition],
          outcomes: [outcome]
        };
      }
      case "gear-up": {
        const outcome = newOutcome("keyboard");
        outcome.key = "L";
        return {
          version: 1,
          actionName: "ED Landing Gear Retracted",
          trigger: defaultTrigger({ type: "flag", flag: "LandingGearDown", edge: "off" }),
          conditions: [],
          outcomes: [outcome]
        };
      }
      case "station-command": {
        const docked = newCondition("global:edDocked", "Equals", "True");
        const station = newCondition("global:edStation", "Equals (Ignore Case)", "Jameson Memorial");
        const outcome = newOutcome("chat");
        outcome.message = "CMDR ~edCmdr~ is docked at ~edStation~ in ~edSystem~.";
        return {
          version: 1,
          actionName: "ED Where Am I Command",
          trigger: defaultTrigger({
            type: "external",
            externalKind: "twitch-command",
            externalLabel: "!whereami"
          }),
          conditions: [docked, station],
          outcomes: [outcome]
        };
      }
      case "docked-station":
      default: {
        const condition = newCondition("arg:edEvent_StationName", "Equals (Ignore Case)", "Jameson Memorial");
        const outcome = newOutcome("sound");
        outcome.file = "C:\\Sounds\\docked.wav";
        return {
          version: 1,
          actionName: "ED Docked at Station",
          trigger: defaultTrigger({ type: "journal", event: "Docked" }),
          conditions: [condition],
          outcomes: [outcome]
        };
      }
    }
  }

  function normalizeState() {
    if (!state || typeof state !== "object") {
      state = createPreset("docked-station");
    }

    state.version = 1;
    state.actionName = typeof state.actionName === "string" ? state.actionName.slice(0, 120) : "";
    state.trigger = {
      ...defaultTrigger(),
      ...(state.trigger && typeof state.trigger === "object" ? state.trigger : {})
    };

    const validTriggerTypes = new Set(["journal", "flag", "companion", "watcher", "external"]);
    if (!validTriggerTypes.has(state.trigger.type)) state.trigger.type = "journal";
    if (!EVENT_GROUPS.some((group) => group.events.includes(state.trigger.event)) && state.trigger.event !== "__any__") {
      state.trigger.event = "Docked";
    }
    if (![...SHIP_FLAGS, ...ON_FOOT_FLAGS].includes(state.trigger.flag)) state.trigger.flag = "Docked";
    if (!["on", "off"].includes(state.trigger.edge)) state.trigger.edge = "on";
    if (!COMPANION_FILES.includes(state.trigger.companion)) state.trigger.companion = "Any file";
    if (!WATCHER_STATUSES.some((item) => item.value === state.trigger.watcherStatus)) state.trigger.watcherStatus = "any";
    if (!EXTERNAL_TRIGGER_KINDS.some((item) => item.value === state.trigger.externalKind)) {
      state.trigger.externalKind = "other";
    }
    state.trigger.externalLabel = String(state.trigger.externalLabel || "").slice(0, 160);

    state.conditions = Array.isArray(state.conditions) ? state.conditions.slice(0, 8) : [];
    state.conditions = state.conditions.map((condition) => ({
      id: uid(),
      variableKey: String(condition.variableKey || "global:edSystem"),
      customName: String(condition.customName || "").slice(0, 180),
      customType: ["string", "number", "boolean"].includes(condition.customType) ? condition.customType : "string",
      operator: String(condition.operator || "Equals (Ignore Case)"),
      value: String(condition.value ?? "").slice(0, 1000),
      autoType: condition.autoType !== false
    }));

    state.outcomes = Array.isArray(state.outcomes) ? state.outcomes.slice(0, 8) : [];
    state.outcomes = state.outcomes.map((rawOutcome) => {
      const outcome = rawOutcome && typeof rawOutcome === "object" ? rawOutcome : {};
      return {
        ...newOutcome(),
        ...outcome,
        id: uid(),
        type: OUTCOME_TYPES.some((item) => item.value === outcome.type) ? outcome.type : "custom"
      };
    });

    if (state.outcomes.length === 0) state.outcomes.push(newOutcome("custom"));
  }

  function handleInput(event) {
    const target = event.target;

    if (target.matches('[data-field="actionName"]')) {
      state.actionName = target.value;
      activePreset = null;
      renderOutputs();
      return;
    }

    if (target.matches("[data-event-search]")) {
      eventSearchTerm = target.value;
      refreshEventOptions();
      return;
    }

    if (target.matches("[data-trigger-field]") && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      state.trigger[target.dataset.triggerField] = target.value;
      activePreset = null;
      renderOutputs();
      return;
    }

    if (target.matches("[data-condition-prop]") && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      const condition = findCondition(target.dataset.conditionId);
      if (!condition) return;
      condition[target.dataset.conditionProp] = target.type === "checkbox" ? target.checked : target.value;
      activePreset = null;
      renderOutputs();
      updateConditionPreview(condition.id);
      return;
    }

    if (target.matches("[data-outcome-prop]") && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      const outcome = findOutcome(target.dataset.outcomeId);
      if (!outcome) return;
      outcome[target.dataset.outcomeProp] = target.type === "checkbox" ? target.checked : target.value;
      activePreset = null;
      renderOutputs();
    }
  }

  function handleChange(event) {
    const target = event.target;

    if (target.matches("[data-trigger-type]")) {
      const previousType = state.trigger.type;
      state.trigger.type = target.value;
      activePreset = null;
      eventSearchTerm = "";
      removeIncompatibleArgumentConditions(previousType, state.trigger.type);
      renderAll();
      return;
    }

    if (target.matches("[data-trigger-field]")) {
      state.trigger[target.dataset.triggerField] = target.type === "checkbox" ? target.checked : target.value;
      activePreset = null;
      if (target.dataset.triggerField === "event") eventSearchTerm = "";
      renderAll();
      return;
    }

    if (target.matches("[data-condition-variable]")) {
      const condition = findCondition(target.dataset.conditionId);
      if (!condition) return;
      condition.variableKey = target.value;
      const resolved = resolveCondition(condition);
      condition.operator = defaultOperator(resolved.type);
      condition.value = resolved.type === "boolean" ? "True" : resolved.type === "number" ? "0" : "";
      activePreset = null;
      renderConditions();
      renderOutputs();
      return;
    }

    if (target.matches("[data-condition-prop]")) {
      const condition = findCondition(target.dataset.conditionId);
      if (!condition) return;
      condition[target.dataset.conditionProp] = target.type === "checkbox" ? target.checked : target.value;
      if (target.dataset.conditionProp === "customType") {
        condition.operator = defaultOperator(condition.customType);
        condition.value = condition.customType === "boolean" ? "True" : condition.customType === "number" ? "0" : "";
        renderConditions();
      } else if (target.dataset.conditionProp === "operator") {
        renderConditions();
      }
      activePreset = null;
      renderOutputs();
      return;
    }

    if (target.matches("[data-outcome-type]")) {
      const outcome = findOutcome(target.dataset.outcomeId);
      if (!outcome) return;
      const replacement = newOutcome(target.value);
      replacement.id = outcome.id;
      Object.assign(outcome, replacement);
      activePreset = null;
      renderOutcomes();
      renderOutputs();
      return;
    }

    if (target.matches("[data-outcome-prop]")) {
      const outcome = findOutcome(target.dataset.outcomeId);
      if (!outcome) return;
      outcome[target.dataset.outcomeProp] = target.type === "checkbox" ? target.checked : target.value;
      activePreset = null;
      renderOutputs();
    }
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.preset) {
      state = createPreset(button.dataset.preset);
      activePreset = button.dataset.preset;
      eventSearchTerm = "";
      renderAll();
      announce(`Loaded the ${button.querySelector("strong")?.textContent || "starter"} recipe.`);
      return;
    }

    switch (button.dataset.action) {
      case "reset-builder":
        state = createPreset("docked-station");
        activePreset = "docked-station";
        eventSearchTerm = "";
        renderAll();
        announce("Builder reset to the docked-at-a-station example.");
        break;
      case "add-condition":
        if (state.conditions.length >= 8) {
          announce("This builder supports up to eight conditions.");
          return;
        }
        state.conditions.push(defaultConditionForTrigger());
        activePreset = null;
        renderConditions();
        renderOutputs();
        break;
      case "remove-condition":
        state.conditions = state.conditions.filter((item) => String(item.id) !== button.dataset.conditionId);
        activePreset = null;
        renderConditions();
        renderOutputs();
        break;
      case "add-outcome":
        if (state.outcomes.length >= 8) {
          announce("This builder supports up to eight sub-actions.");
          return;
        }
        state.outcomes.push(newOutcome("custom"));
        activePreset = null;
        renderOutcomes();
        renderOutputs();
        break;
      case "remove-outcome":
        if (state.outcomes.length === 1) {
          announce("Keep at least one sub-action in the build.");
          return;
        }
        state.outcomes = state.outcomes.filter((item) => String(item.id) !== button.dataset.outcomeId);
        activePreset = null;
        renderOutcomes();
        renderOutputs();
        break;
      case "insert-variable":
        insertVariable(button);
        break;
      case "copy-guide":
        copyText(buildGuideText(), "Full setup copied.");
        break;
      case "copy-link":
        copyText(buildShareLink(), "Share link copied.");
        break;
      case "copy-variables":
        copyText(buildVariablesText(), "Variable list copied.");
        break;
      case "copy-token":
        copyText(button.dataset.token || "", `${button.dataset.token || "Variable"} copied.`);
        break;
      default:
        break;
    }
  }

  function renderAll() {
    elements.actionName.value = state.actionName;
    document.querySelectorAll("[data-trigger-type]").forEach((radio) => {
      radio.checked = radio.value === state.trigger.type;
    });
    document.querySelectorAll("[data-preset]").forEach((card) => {
      card.classList.toggle("is-active", card.dataset.preset === activePreset);
    });
    renderTriggerConfig();
    renderAutomaticConditions();
    renderConditions();
    renderOutcomes();
    renderOutputs();
  }

  function renderOutputs() {
    const validation = validateBuild();
    const allConditions = getAllConditions();

    elements.recipeSentence.textContent = buildRecipeSentence();
    elements.previewSummary.textContent = `${state.actionName || "Unnamed action"} · ${triggerPath()}`;
    elements.actionTree.innerHTML = buildActionTree(allConditions);

    elements.buildStatus.className = "status-pill";
    if (validation.errors.length) {
      elements.buildStatus.textContent = `Fix ${validation.errors.length}`;
      elements.buildStatus.classList.add("has-error");
    } else if (validation.warnings.length) {
      elements.buildStatus.textContent = `Review ${validation.warnings.length}`;
      elements.buildStatus.classList.add("has-warning");
    } else {
      elements.buildStatus.textContent = "Ready";
    }

    renderNotices(validation);
    renderSetupSteps(allConditions);
    renderUsedVariables();
    renderAvailableVariables();
  }

  function renderTriggerConfig() {
    switch (state.trigger.type) {
      case "flag":
        elements.triggerConfig.innerHTML = `
          <div class="form-grid">
            <div class="field">
              <label for="flag-name">Flag</label>
              <select id="flag-name" data-trigger-field="flag">
                <optgroup label="Ship flags">
                  ${SHIP_FLAGS.map((name) => option(name, splitCamel(name), state.trigger.flag)).join("")}
                </optgroup>
                <optgroup label="On-foot flags">
                  ${ON_FOOT_FLAGS.map((name) => option(name, splitCamel(name), state.trigger.flag)).join("")}
                </optgroup>
              </select>
            </div>
            <div class="field">
              <label for="flag-edge">Change</label>
              <select id="flag-edge" data-trigger-field="edge">
                ${option("on", "Turns On", state.trigger.edge)}
                ${option("off", "Turns Off", state.trigger.edge)}
              </select>
            </div>
          </div>
          <div class="inline-note">
            Trigger path: <code>${escapeHtml(triggerPath())}</code>. This trigger supplies
            <code>%edFlag%</code>, <code>%edValue%</code>, and <code>%edSystem%</code>.
          </div>`;
        break;
      case "companion":
        elements.triggerConfig.innerHTML = `
          <div class="form-grid">
            <div class="field full">
              <label for="companion-file">Which companion file?</label>
              <select id="companion-file" data-trigger-field="companion">
                ${COMPANION_FILES.map((name) => option(name, name, state.trigger.companion)).join("")}
              </select>
              <span class="field-help">Streamer.bot has one Companion File Updated trigger. Choosing a specific file makes the builder add the required <code>%edCompanionName%</code> filter automatically.</span>
            </div>
          </div>
          <div class="inline-note">
            Trigger path: <code>${escapeHtml(triggerPath())}</code>. The trigger supplies
            <code>%edCompanionName%</code>, <code>%edCompanionFile%</code>, and <code>%edCompanionJson%</code>.
          </div>`;
        break;
      case "watcher":
        elements.triggerConfig.innerHTML = `
          <div class="form-grid">
            <div class="field full">
              <label for="watcher-status">Which watcher status?</label>
              <select id="watcher-status" data-trigger-field="watcherStatus">
                ${WATCHER_STATUSES.map((item) => option(item.value, item.label, state.trigger.watcherStatus)).join("")}
              </select>
              <span class="field-help">Choosing one status adds a required <code>%edStatus%</code> filter automatically.</span>
            </div>
          </div>
          <div class="inline-note">
            Trigger path: <code>${escapeHtml(triggerPath())}</code>. The trigger supplies
            <code>%edStatus%</code>, <code>%edMessage%</code>, and <code>%edJournalFile%</code>.
          </div>`;
        break;
      case "external":
        elements.triggerConfig.innerHTML = `
          <div class="form-grid">
            <div class="field">
              <label for="external-kind">Ordinary Streamer.bot trigger</label>
              <select id="external-kind" data-trigger-field="externalKind">
                ${EXTERNAL_TRIGGER_KINDS.map((item) => option(item.value, item.label, state.trigger.externalKind)).join("")}
              </select>
            </div>
            <div class="field">
              <label for="external-label">Command, hotkey, timer, or trigger name</label>
              <input id="external-label" type="text" value="${escapeAttr(state.trigger.externalLabel)}" data-trigger-field="externalLabel" placeholder="Example: !whereami">
            </div>
          </div>
          <div class="inline-note">
            This route does not receive Elite watcher event arguments. Build conditions with persisted globals such as
            <code>~edDocked~</code>, <code>~edStation~</code>, and <code>~edSystem~</code>.
          </div>`;
        break;
      case "journal":
      default:
        elements.triggerConfig.innerHTML = `
          <div class="form-grid">
            <div class="field">
              <label for="event-search">Find an event</label>
              <input id="event-search" type="text" value="${escapeAttr(eventSearchTerm)}" data-event-search placeholder="Search Docked, Bounty, Scan…">
            </div>
            <div class="field">
              <label for="event-name">Journal event</label>
              <select id="event-name" data-trigger-field="event">
                ${buildEventOptions(state.trigger.event, eventSearchTerm)}
              </select>
            </div>
          </div>
          <div class="inline-note">
            Trigger path: <code>${escapeHtml(triggerPath())}</code>. Every journal trigger supplies
            <code>%edEventName%</code>, <code>%edEventTimestamp%</code>, <code>%edEventJson%</code>,
            and each event field as <code>%edEvent_&lt;Field&gt;%</code>.
          </div>`;
        break;
    }
  }

  function renderAutomaticConditions() {
    const automatic = getAutomaticConditions();
    if (!automatic.length) {
      elements.automaticConditions.innerHTML = "";
      return;
    }

    elements.automaticConditions.innerHTML = automatic.map((condition) => `
      <div class="automatic-condition">
        <strong>Automatic filter:</strong>
        <code>${escapeHtml(condition.token)}</code>
        <span>${escapeHtml(condition.operator)}</span>
        <code>${escapeHtml(condition.value)}</code>.
        It will be the first If/Else in the generated setup.
      </div>
    `).join("");
  }

  function renderConditions() {
    if (!state.conditions.length) {
      elements.conditionsList.innerHTML = `
        <div class="empty-state">
          No extra conditions. The action will run every time the selected trigger fires.
        </div>`;
      return;
    }

    elements.conditionsList.innerHTML = state.conditions.map((condition, index) => {
      const resolved = resolveCondition(condition);
      const operators = operatorsForType(resolved.type);
      if (!operators.includes(condition.operator)) condition.operator = defaultOperator(resolved.type);
      const noValue = condition.operator === "Is Null or Empty";

      return `
        <article class="config-card" data-condition-card="${condition.id}">
          <div class="config-card-heading">
            <strong>Condition ${index + 1}</strong>
            <button type="button" class="remove-button" data-action="remove-condition" data-condition-id="${condition.id}">Remove</button>
          </div>
          <div class="condition-grid">
            <div class="field">
              <label for="condition-variable-${condition.id}">Variable</label>
              <select id="condition-variable-${condition.id}" data-condition-variable data-condition-id="${condition.id}">
                ${buildVariableOptions(condition.variableKey)}
              </select>
            </div>
            <div class="field">
              <label for="condition-operator-${condition.id}">Operator</label>
              <select id="condition-operator-${condition.id}" data-condition-prop="operator" data-condition-id="${condition.id}">
                ${operators.map((operatorName) => option(operatorName, operatorName, condition.operator)).join("")}
              </select>
            </div>
            <div class="field">
              <label for="condition-value-${condition.id}">Value</label>
              ${renderConditionValueInput(condition, resolved.type, noValue)}
            </div>
            ${renderCustomConditionFields(condition)}
          </div>
          <label class="check-row">
            <input type="checkbox" data-condition-prop="autoType" data-condition-id="${condition.id}" ${condition.autoType ? "checked" : ""}>
            Auto Type on (recommended for numbers and True/False)
          </label>
          <div class="condition-preview" data-condition-preview="${condition.id}">
            ${conditionPreviewHtml(condition)}
          </div>
        </article>`;
    }).join("");
  }

  function renderOutcomes() {
    elements.outcomesList.innerHTML = state.outcomes.map((outcome, index) => `
      <article class="config-card">
        <div class="config-card-heading">
          <strong>Sub-action ${index + 1}</strong>
          <button type="button" class="remove-button" data-action="remove-outcome" data-outcome-id="${outcome.id}">Remove</button>
        </div>
        <div class="field">
          <label for="outcome-type-${outcome.id}">What should it do?</label>
          <select id="outcome-type-${outcome.id}" data-outcome-type data-outcome-id="${outcome.id}">
            ${OUTCOME_TYPES.map((item) => option(item.value, item.label, outcome.type)).join("")}
          </select>
        </div>
        <div class="outcome-fields">
          ${renderOutcomeFields(outcome)}
        </div>
      </article>
    `).join("");
  }

  function renderOutcomeFields(outcome) {
    switch (outcome.type) {
      case "tts":
        return `
          <div class="field full">
            <label for="outcome-message-${outcome.id}">Text to speak</label>
            <textarea id="outcome-message-${outcome.id}" data-outcome-prop="message" data-outcome-id="${outcome.id}" placeholder="Arrived in %edEvent_StarSystem%.">${escapeHtml(outcome.message)}</textarea>
          </div>
          ${renderInsertControl(outcome, "message")}`;
      case "chat":
        return `
          <div class="field">
            <label for="outcome-platform-${outcome.id}">Platform</label>
            <select id="outcome-platform-${outcome.id}" data-outcome-prop="platform" data-outcome-id="${outcome.id}">
              ${["Twitch", "Kick", "YouTube"].map((name) => option(name, name, outcome.platform)).join("")}
            </select>
          </div>
          <div class="field full">
            <label for="outcome-message-${outcome.id}">Message</label>
            <textarea id="outcome-message-${outcome.id}" data-outcome-prop="message" data-outcome-id="${outcome.id}" placeholder="Docked at %edEvent_StationName% in %edEvent_StarSystem%.">${escapeHtml(outcome.message)}</textarea>
          </div>
          ${renderInsertControl(outcome, "message")}`;
      case "obs":
        return `
          <div class="field">
            <label for="outcome-scene-${outcome.id}">Scene</label>
            <input id="outcome-scene-${outcome.id}" type="text" value="${escapeAttr(outcome.scene)}" data-outcome-prop="scene" data-outcome-id="${outcome.id}" placeholder="Elite Dangerous">
          </div>
          <div class="field">
            <label for="outcome-source-${outcome.id}">Source</label>
            <input id="outcome-source-${outcome.id}" type="text" value="${escapeAttr(outcome.source)}" data-outcome-prop="source" data-outcome-id="${outcome.id}" placeholder="Docked Alert">
          </div>
          <div class="field">
            <label for="outcome-obs-state-${outcome.id}">State</label>
            <select id="outcome-obs-state-${outcome.id}" data-outcome-prop="obsState" data-outcome-id="${outcome.id}">
              ${["Visible", "Hidden", "Toggle"].map((name) => option(name, name, outcome.obsState)).join("")}
            </select>
          </div>`;
      case "run-action":
        return `
          <div class="field full">
            <label for="outcome-action-${outcome.id}">Action to run</label>
            <input id="outcome-action-${outcome.id}" type="text" value="${escapeAttr(outcome.actionName)}" data-outcome-prop="actionName" data-outcome-id="${outcome.id}" placeholder="Example: ED Docked Alert Visuals">
          </div>`;
      case "keyboard":
        return `
          <div class="field full">
            <label for="outcome-key-${outcome.id}">Key or shortcut</label>
            <input id="outcome-key-${outcome.id}" type="text" value="${escapeAttr(outcome.key)}" data-outcome-prop="key" data-outcome-id="${outcome.id}" placeholder="Example: L or Ctrl+Shift+F1">
            <span class="field-help">Configure the exact key and press/release behavior in Streamer.bot's Keyboard Press dialog.</span>
          </div>`;
      case "custom":
        return `
          <div class="field">
            <label for="outcome-search-${outcome.id}">Sub-action name or search term</label>
            <input id="outcome-search-${outcome.id}" type="text" value="${escapeAttr(outcome.searchName)}" data-outcome-prop="searchName" data-outcome-id="${outcome.id}" placeholder="Example: Set GDI Text">
          </div>
          <div class="field full">
            <label for="outcome-notes-${outcome.id}">Settings or notes</label>
            <textarea id="outcome-notes-${outcome.id}" data-outcome-prop="notes" data-outcome-id="${outcome.id}" placeholder="Describe what this sub-action should do. Variable tokens can be pasted here.">${escapeHtml(outcome.notes)}</textarea>
          </div>
          ${renderInsertControl(outcome, "notes")}`;
      case "sound":
      default:
        return `
          <div class="field full">
            <label for="outcome-file-${outcome.id}">Sound file</label>
            <input id="outcome-file-${outcome.id}" type="text" value="${escapeAttr(outcome.file)}" data-outcome-prop="file" data-outcome-id="${outcome.id}" placeholder="C:\\Sounds\\alert.wav">
          </div>
          <div class="field">
            <label for="outcome-volume-${outcome.id}">Volume</label>
            <input id="outcome-volume-${outcome.id}" type="number" min="0" max="100" value="${escapeAttr(outcome.volume)}" data-outcome-prop="volume" data-outcome-id="${outcome.id}">
          </div>
          <div class="field">
            <label class="check-row">
              <input type="checkbox" data-outcome-prop="wait" data-outcome-id="${outcome.id}" ${outcome.wait ? "checked" : ""}>
              Finish playing before continuing
            </label>
          </div>`;
    }
  }

  function renderInsertControl(outcome, targetProp) {
    const variables = getInsertableVariables();
    return `
      <div class="field full insert-row">
        <div>
          <label for="insert-variable-${outcome.id}">Insert a variable</label>
          <select id="insert-variable-${outcome.id}" data-insert-select="${outcome.id}">
            ${variables.map((item) => option(item.token, `${item.token} — ${item.label}`, "")).join("")}
          </select>
        </div>
        <button type="button" class="button button-secondary" data-action="insert-variable" data-outcome-id="${outcome.id}" data-target-prop="${targetProp}">Insert</button>
      </div>`;
  }

  function renderConditionValueInput(condition, type, disabled) {
    if (disabled) {
      return `<input id="condition-value-${condition.id}" type="text" value="No value required" disabled>`;
    }
    if (type === "boolean") {
      return `
        <select id="condition-value-${condition.id}" data-condition-prop="value" data-condition-id="${condition.id}">
          ${option("True", "True", normalizeBoolean(condition.value))}
          ${option("False", "False", normalizeBoolean(condition.value))}
        </select>`;
    }
    const inputType = type === "number" ? "number" : "text";
    return `<input id="condition-value-${condition.id}" type="${inputType}" value="${escapeAttr(condition.value)}" data-condition-prop="value" data-condition-id="${condition.id}" placeholder="${type === "number" ? "250000" : "Value to compare"}">`;
  }

  function renderCustomConditionFields(condition) {
    if (!condition.variableKey.startsWith("custom:")) return "";

    const labels = {
      "custom:event": {
        label: "Journal field name",
        help: "Enter the field name without the edEvent_ prefix. Nested names use underscores.",
        placeholder: "Example: StationFaction_Name"
      },
      "custom:global": {
        label: "Persisted global name",
        help: "Enter the name without tildes.",
        placeholder: "Example: edFileCargo_Count"
      },
      "custom:token": {
        label: "Complete variable token",
        help: "Paste the complete %argument% or ~persistedGlobal~ token.",
        placeholder: "Example: ~edEvtDocked_StationName~"
      }
    };
    const config = labels[condition.variableKey] || labels["custom:token"];

    return `
      <div class="condition-custom">
        <div class="field">
          <label for="condition-custom-${condition.id}">${config.label}</label>
          <input id="condition-custom-${condition.id}" type="text" value="${escapeAttr(condition.customName)}" data-condition-prop="customName" data-condition-id="${condition.id}" placeholder="${config.placeholder}">
          <span class="field-help">${config.help}</span>
        </div>
        <div class="field">
          <label for="condition-type-${condition.id}">Value type</label>
          <select id="condition-type-${condition.id}" data-condition-prop="customType" data-condition-id="${condition.id}">
            ${option("string", "Text", condition.customType)}
            ${option("number", "Number", condition.customType)}
            ${option("boolean", "True / False", condition.customType)}
          </select>
        </div>
      </div>`;
  }

  function renderNotices(validation) {
    const notices = [];
    notices.push(`
      <div class="notice">
        <strong>Prerequisite:</strong>
        This guide assumes the <a href="index.html#csharp-watcher">standalone C# watcher</a> is installed, compiled, and running in Streamer.bot.
      </div>`);

    validation.errors.forEach((message) => {
      notices.push(`<div class="notice error"><strong>Fix:</strong> ${escapeHtml(message)}</div>`);
    });
    validation.warnings.forEach((message) => {
      notices.push(`<div class="notice warning"><strong>Review:</strong> ${escapeHtml(message)}</div>`);
    });

    elements.buildNotices.innerHTML = notices.join("");
  }

  function renderSetupSteps(allConditions) {
    const steps = [];
    const actionName = state.actionName || "your new action";

    steps.push(`
      <li>
        <h3>Confirm the standalone watcher is ready</h3>
        <p>In Streamer.bot, make sure the <code>ED Journal Watcher</code> C# action is compiled, set to <strong>Precompile on Application Start</strong>, and running. Its custom Elite Dangerous triggers must exist before you can select them.</p>
      </li>`);

    steps.push(`
      <li>
        <h3>Create the action</h3>
        <p>Open <strong>Actions &amp; Queues → Actions</strong>, right-click the Actions pane, choose <strong>Add</strong>, and name it <code>${escapeHtml(actionName)}</code>. An <code>Elite Dangerous</code> group is optional but keeps these actions organized.</p>
      </li>`);

    steps.push(`
      <li>
        <h3>${state.trigger.type === "external" ? "Connect the ordinary Streamer.bot trigger" : "Attach the Elite Dangerous trigger"}</h3>
        ${triggerSetupHtml()}
      </li>`);

    if (allConditions.length) {
      steps.push(`
        <li>
          <h3>Add the If/Else checks in this order</h3>
          <p>Add the first <strong>Core → Logic → If/Else</strong> at the root of the Sub-Actions pane. For every later row, add another If/Else <strong>inside the previous True Result</strong>. This creates an AND chain: every row must pass.</p>
          <table class="config-table">
            <thead>
              <tr><th>#</th><th>Input</th><th>Operator</th><th>Value</th><th>Auto Type</th><th>Place it</th></tr>
            </thead>
            <tbody>
              ${allConditions.map((condition, index) => `
                <tr>
                  <td>${index + 1}${condition.automatic ? " · auto" : ""}</td>
                  <td><code>${escapeHtml(condition.input)}</code></td>
                  <td>${escapeHtml(condition.operator)}</td>
                  <td>${condition.operator === "Is Null or Empty" ? "<em>leave blank</em>" : `<code>${escapeHtml(condition.value)}</code>`}</td>
                  <td>${condition.autoType ? "On" : "Off"}</td>
                  <td>${index === 0 ? "Root of Sub-Actions" : `Inside Condition ${index}'s True Result`}</td>
                </tr>`).join("")}
            </tbody>
          </table>
          <p>Leave every <strong>False Result</strong> empty unless you specifically want a separate fallback behavior.</p>
        </li>`);
    } else {
      steps.push(`
        <li>
          <h3>No If/Else is needed</h3>
          <p>You did not add any conditions, so the selected sub-actions can sit directly in the root of the Sub-Actions pane.</p>
        </li>`);
    }

    steps.push(`
      <li>
        <h3>Add the result sub-actions</h3>
        <p>${allConditions.length ? "Put these inside the final condition's True Result, in this order:" : "Add these directly to the action, in this order:"}</p>
        <table class="config-table">
          <thead><tr><th>#</th><th>Sub-action</th><th>Settings</th></tr></thead>
          <tbody>
            ${state.outcomes.map((outcome, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHtml(outcomePath(outcome))}</strong></td>
                <td>${outcomeSettingsHtml(outcome)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </li>`);

    steps.push(`
      <li>
        <h3>Save and test with real data</h3>
        <p>${testInstruction()}</p>
        <p>Then open <strong>Action Queues → Action History</strong>, right-click the run, and choose <strong>Inspect Variables After Run</strong>. Compare the values there with the generated variable list below.</p>
      </li>`);

    elements.setupSteps.innerHTML = steps.join("");
  }

  function renderUsedVariables() {
    const variables = getUsedVariables();
    elements.usedVariables.innerHTML = renderVariableRows(
      variables,
      "No variable tokens are required by the current conditions or sub-action text."
    );
  }

  function renderAvailableVariables() {
    const usedTokens = new Set(getUsedVariables().map((item) => item.token));
    const variables = getAvailableVariables().filter((item) => !usedTokens.has(item.token));
    elements.availableVariables.innerHTML = renderVariableRows(
      variables,
      "This trigger has no watcher-specific arguments. Add live globals as conditions or insert them into a text sub-action."
    );
  }

  function renderVariableRows(variables, emptyText) {
    if (!variables.length) return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    return `
      <div class="variable-list">
        ${variables.map((item) => `
          <div class="variable-row">
            <div>
              <code>${escapeHtml(item.token)}</code>
              <p>${escapeHtml(item.label)} · ${escapeHtml(item.source || "Variable")}. ${escapeHtml(item.description || "")}</p>
            </div>
            <button type="button" class="copy-token" data-action="copy-token" data-token="${escapeAttr(item.token)}">Copy</button>
          </div>`).join("")}
      </div>`;
  }

  function buildEventOptions(selected, filterText) {
    const filter = filterText.trim().toLowerCase();
    const chunks = [];
    if (!filter || "any journal event".includes(filter) || selected === "__any__") {
      chunks.push(option("__any__", "Any Journal Event", selected));
    }

    EVENT_GROUPS.forEach((group) => {
      const matches = group.events.filter((eventName) => {
        return !filter || eventName.toLowerCase().includes(filter) || eventName === selected;
      });
      if (!matches.length) return;
      chunks.push(`<optgroup label="${escapeAttr(group.label)}">`);
      chunks.push(matches.map((eventName) => option(eventName, eventName, selected)).join(""));
      chunks.push("</optgroup>");
    });

    return chunks.length ? chunks.join("") : `<option value="${escapeAttr(selected)}">${escapeHtml(selected)} — no other matches</option>`;
  }

  function refreshEventOptions() {
    const select = document.querySelector('[data-trigger-field="event"]');
    if (!select) return;
    select.innerHTML = buildEventOptions(state.trigger.event, eventSearchTerm);
    select.value = state.trigger.event;
  }

  function buildVariableOptions(selectedKey) {
    const groups = getVariableGroups();
    const known = groups.some((group) => group.variables.some((item) => item.key === selectedKey));
    const customKeys = new Set(["custom:event", "custom:global", "custom:token"]);
    const html = [];

    if (!known && !customKeys.has(selectedKey)) {
      html.push(`<optgroup label="Current selection"><option value="${escapeAttr(selectedKey)}" selected>${escapeHtml(selectedKey)} — verify for this trigger</option></optgroup>`);
    }

    groups.forEach((group) => {
      if (!group.variables.length) return;
      html.push(`<optgroup label="${escapeAttr(group.label)}">`);
      group.variables.forEach((item) => {
        html.push(option(item.key, `${item.label} — ${item.token}`, selectedKey));
      });
      html.push("</optgroup>");
    });

    html.push('<optgroup label="Other variable">');
    if (state.trigger.type === "journal") {
      html.push(option("custom:event", "Other event field…", selectedKey));
    }
    html.push(option("custom:global", "Other persisted global…", selectedKey));
    html.push(option("custom:token", "Paste a complete variable token…", selectedKey));
    html.push("</optgroup>");

    return html.join("");
  }

  function getVariableGroups() {
    const groups = [];
    const triggerVariables = getTriggerVariables();
    if (triggerVariables.length) {
      groups.push({
        label: triggerVariableGroupLabel(),
        variables: triggerVariables
      });
    }

    const mirrorVariables = getMirrorVariables();
    if (mirrorVariables.length) {
      groups.push({
        label: `Latest ${state.trigger.event} event mirror`,
        variables: mirrorVariables
      });
    }

    GLOBAL_GROUPS.forEach((group) => groups.push(group));
    return groups;
  }

  function getTriggerVariables() {
    switch (state.trigger.type) {
      case "flag":
        return [
          variable("arg:edFlag", "%edFlag%", "Changed flag", "string", "Flag name that changed.", "Trigger argument"),
          variable("arg:edValue", "%edValue%", "New flag value", "boolean", "True when on, False when off.", "Trigger argument"),
          variable("arg:edSystem", "%edSystem%", "System at change", "string", "Current star system when the flag changed.", "Trigger argument")
        ];
      case "companion":
        return [
          variable("arg:edCompanionName", "%edCompanionName%", "Companion name", "string", "File name without .json.", "Trigger argument"),
          variable("arg:edCompanionFile", "%edCompanionFile%", "Companion filename", "string", "Full filename such as Cargo.json.", "Trigger argument"),
          variable("arg:edCompanionJson", "%edCompanionJson%", "Companion JSON", "string", "Full JSON, capped at 4,000 characters.", "Trigger argument")
        ];
      case "watcher":
        return [
          variable("arg:edStatus", "%edStatus%", "Watcher status", "string", "started, stopped, hydrated, journal_changed, or error.", "Trigger argument"),
          variable("arg:edMessage", "%edMessage%", "Status message", "string", "Human-readable watcher detail.", "Trigger argument"),
          variable("arg:edJournalFile", "%edJournalFile%", "Journal file", "string", "Current journal filename.", "Trigger argument")
        ];
      case "external":
        return [];
      case "journal":
      default: {
        const variables = [
          variable("arg:edEventName", "%edEventName%", "Event name", "string", "Journal event type.", "Trigger argument"),
          variable("arg:edEventTimestamp", "%edEventTimestamp%", "Event timestamp", "string", "In-game UTC timestamp.", "Trigger argument"),
          variable("arg:edEventJson", "%edEventJson%", "Raw event JSON", "string", "Complete event JSON, capped at 4,000 characters.", "Trigger argument")
        ];
        const fields = EVENT_FIELDS[state.trigger.event] || [];
        fields.forEach((item) => {
          variables.push(variable(
            `arg:edEvent_${item.name}`,
            `%edEvent_${item.name}%`,
            item.label,
            item.type,
            item.description,
            `${state.trigger.event} trigger argument`
          ));
        });
        return variables;
      }
    }
  }

  function getMirrorVariables() {
    if (state.trigger.type !== "journal" || state.trigger.event === "__any__") return [];
    const safeEvent = sanitizeName(state.trigger.event);
    const variables = [
      variable(`mirror:${safeEvent}:count`, `~edEvt${safeEvent}Count~`, `${state.trigger.event} count`, "number", "Occurrences this session.", "Latest-event mirror"),
      variable(`mirror:${safeEvent}:last`, `~edEvt${safeEvent}Last~`, `Latest ${state.trigger.event} time`, "string", "Timestamp of the latest occurrence.", "Latest-event mirror")
    ];
    (EVENT_FIELDS[state.trigger.event] || []).forEach((item) => {
      variables.push(variable(
        `mirror:${safeEvent}:${item.name}`,
        `~edEvt${safeEvent}_${item.name}~`,
        `Latest ${item.label.toLowerCase()}`,
        item.type,
        item.description,
        "Latest-event mirror"
      ));
    });
    return variables;
  }

  function resolveCondition(condition) {
    if (condition.variableKey === "custom:event") {
      const fieldName = sanitizeName(condition.customName);
      return variable(
        condition.variableKey,
        fieldName ? `%edEvent_${fieldName}%` : "%edEvent_<Field>%",
        fieldName ? splitCamel(fieldName.replace(/_/g, " ")) : "Other event field",
        condition.customType,
        "Custom journal event field.",
        "Trigger argument"
      );
    }

    if (condition.variableKey === "custom:global") {
      const name = stripVariableWrapper(condition.customName);
      return variable(
        condition.variableKey,
        name ? `~${name}~` : "~edVariableName~",
        name || "Other persisted global",
        condition.customType,
        "Custom persisted global.",
        "Persisted global"
      );
    }

    if (condition.variableKey === "custom:token") {
      const token = condition.customName.trim() || "%variable%";
      return variable(
        condition.variableKey,
        token,
        "Custom variable token",
        condition.customType,
        "User-supplied variable token.",
        token.startsWith("~") ? "Persisted global" : "Argument"
      );
    }

    const found = getVariableGroups()
      .flatMap((group) => group.variables)
      .find((item) => item.key === condition.variableKey);
    if (found) return found;

    if (condition.variableKey.startsWith("arg:")) {
      const name = condition.variableKey.slice(4);
      return variable(condition.variableKey, `%${name}%`, splitCamel(name), condition.customType, "Argument from a previous selection.", "Argument");
    }
    if (condition.variableKey.startsWith("global:")) {
      const name = condition.variableKey.slice(7);
      return variable(condition.variableKey, `~${name}~`, splitCamel(name), condition.customType, "Persisted global from a previous selection.");
    }
    return variable(condition.variableKey, condition.variableKey, condition.variableKey, condition.customType, "Variable from a previous selection.", "Variable");
  }

  function getAutomaticConditions() {
    if (state.trigger.type === "companion" && state.trigger.companion !== "Any file") {
      return [{
        token: "%edCompanionName%",
        input: "%edCompanionName%",
        operator: "Equals (Ignore Case)",
        value: state.trigger.companion,
        autoType: true,
        automatic: true,
        label: "Companion file filter",
        type: "string",
        source: "Trigger argument",
        description: "Limits the shared companion-file trigger to the selected file."
      }];
    }
    if (state.trigger.type === "watcher" && state.trigger.watcherStatus !== "any") {
      return [{
        token: "%edStatus%",
        input: "%edStatus%",
        operator: "Equals (Ignore Case)",
        value: state.trigger.watcherStatus,
        autoType: true,
        automatic: true,
        label: "Watcher status filter",
        type: "string",
        source: "Trigger argument",
        description: "Limits the shared watcher-status trigger to the selected status."
      }];
    }
    return [];
  }

  function getAllConditions() {
    const automatic = getAutomaticConditions();
    const manual = state.conditions.map((condition) => {
      const resolved = resolveCondition(condition);
      return {
        token: resolved.token,
        input: resolved.token,
        operator: condition.operator,
        value: condition.value,
        autoType: condition.autoType,
        automatic: false,
        label: resolved.label,
        type: resolved.type,
        source: resolved.source,
        description: resolved.description
      };
    });
    return [...automatic, ...manual];
  }

  function defaultConditionForTrigger() {
    switch (state.trigger.type) {
      case "journal": {
        const firstField = (EVENT_FIELDS[state.trigger.event] || [])[0];
        if (firstField) {
          return newCondition(
            `arg:edEvent_${firstField.name}`,
            defaultOperator(firstField.type),
            firstField.type === "boolean" ? "True" : firstField.type === "number" ? "0" : ""
          );
        }
        return newCondition("custom:event", "Equals (Ignore Case)", "");
      }
      case "flag":
        return newCondition(`global:ed${state.trigger.flag}`, "Equals", state.trigger.edge === "on" ? "True" : "False");
      case "companion":
        return newCondition("custom:global", "Equals", "");
      case "watcher":
        return newCondition("arg:edMessage", "Contains", "");
      case "external":
      default:
        return newCondition("global:edSystem", "Equals (Ignore Case)", "");
    }
  }

  function removeIncompatibleArgumentConditions(previousType, nextType) {
    if (previousType === nextType) return;
    state.conditions = state.conditions.filter((condition) => {
      if (condition.variableKey.startsWith("global:") || condition.variableKey.startsWith("mirror:")) return true;
      if (condition.variableKey === "custom:global" || condition.variableKey === "custom:token") return true;
      return false;
    });
  }

  function updateConditionPreview(conditionId) {
    const condition = findCondition(conditionId);
    const preview = document.querySelector(`[data-condition-preview="${conditionId}"]`);
    if (!condition || !preview) return;
    preview.innerHTML = conditionPreviewHtml(condition);
  }

  function conditionPreviewHtml(condition) {
    const resolved = resolveCondition(condition);
    return `
      <span>Streamer.bot will test</span>
      <code>${escapeHtml(resolved.token)}</code>
      <span>${escapeHtml(condition.operator)}</span>
      ${condition.operator === "Is Null or Empty" ? "" : `<code>${escapeHtml(condition.value || "…")}</code>`}
    `;
  }

  function buildRecipeSentence() {
    const trigger = triggerSentence();
    const conditions = getAllConditions();
    const outcomes = state.outcomes;
    const conditionText = conditions.length
      ? `, if ${conditions.slice(0, 2).map(conditionSentence).join(" and ")}${conditions.length > 2 ? ` and ${conditions.length - 2} more` : ""}`
      : "";
    const outcomeText = outcomes.length
      ? outcomes.slice(0, 2).map(outcomeSentence).join(" and ") + (outcomes.length > 2 ? ` and ${outcomes.length - 2} more` : "")
      : "do nothing";
    return `When ${trigger}${conditionText}, then ${outcomeText}.`;
  }

  function triggerSentence() {
    switch (state.trigger.type) {
      case "flag":
        return `${splitCamel(state.trigger.flag)} turns ${state.trigger.edge}`;
      case "companion":
        return state.trigger.companion === "Any file"
          ? "a companion file updates"
          : `${state.trigger.companion}.json updates`;
      case "watcher": {
        const label = WATCHER_STATUSES.find((item) => item.value === state.trigger.watcherStatus)?.label || "status changes";
        return state.trigger.watcherStatus === "any" ? "the watcher status changes" : `the watcher reports ${label.toLowerCase()}`;
      }
      case "external": {
        const kind = EXTERNAL_TRIGGER_KINDS.find((item) => item.value === state.trigger.externalKind)?.label || "another trigger";
        return `${kind.toLowerCase()} ${state.trigger.externalLabel || ""}`.trim();
      }
      case "journal":
      default:
        return state.trigger.event === "__any__" ? "any journal event happens" : `${state.trigger.event} happens`;
    }
  }

  function conditionSentence(condition) {
    const value = condition.operator === "Is Null or Empty" ? "is empty" : `${condition.operator.toLowerCase()} ${condition.value || "…"}`;
    return `${condition.label.toLowerCase()} ${value}`;
  }

  function outcomeSentence(outcome) {
    switch (outcome.type) {
      case "tts": return "speak a TTS line";
      case "chat": return `send a ${outcome.platform || "chat"} message`;
      case "obs": return `${(outcome.obsState || "toggle").toLowerCase()} an OBS source`;
      case "run-action": return "run another action";
      case "keyboard": return "press a key";
      case "custom": return outcome.searchName ? `run ${outcome.searchName}` : "run a custom sub-action";
      case "sound":
      default: return "play a sound";
    }
  }

  function triggerPath() {
    switch (state.trigger.type) {
      case "flag":
        return `Custom → Elite Dangerous → Ship State → ${state.trigger.flag} ${state.trigger.edge === "on" ? "On" : "Off"}`;
      case "companion":
        return "Custom → Elite Dangerous → Companion File Updated";
      case "watcher":
        return "Custom → Elite Dangerous → Watcher Status";
      case "external": {
        const kind = EXTERNAL_TRIGGER_KINDS.find((item) => item.value === state.trigger.externalKind)?.label || "Other trigger";
        return `${kind}${state.trigger.externalLabel ? ` → ${state.trigger.externalLabel}` : ""}`;
      }
      case "journal":
      default:
        return state.trigger.event === "__any__"
          ? "Custom → Elite Dangerous → Any Journal Event"
          : `Custom → Elite Dangerous → Journal Events → ${state.trigger.event}`;
    }
  }

  function triggerSetupHtml() {
    if (state.trigger.type !== "external") {
      return `<p>Select the action, right-click its <strong>Triggers</strong> pane (or click <strong>+</strong>), then choose <code>${escapeHtml(triggerPath())}</code>.</p>`;
    }

    const label = state.trigger.externalLabel || "your trigger";
    switch (state.trigger.externalKind) {
      case "twitch-command":
        return `<p>Create or select the Twitch command <code>${escapeHtml(label)}</code> and connect it to <code>${escapeHtml(state.actionName || "this action")}</code>. This action will read the watcher's persisted globals when the command runs.</p>`;
      case "youtube-command":
        return `<p>Create or select the YouTube command <code>${escapeHtml(label)}</code> and connect it to <code>${escapeHtml(state.actionName || "this action")}</code>. This action will read the watcher's persisted globals when the command runs.</p>`;
      case "hotkey":
        return `<p>Add your normal hotkey trigger for <code>${escapeHtml(label)}</code> to this action. The Elite checks below use persisted globals, so no Elite event argument is required.</p>`;
      case "timer":
        return `<p>Add or connect the timer <code>${escapeHtml(label)}</code> to this action. The Elite checks below use persisted globals at the moment the timer fires.</p>`;
      case "stream-deck":
        return `<p>Configure the Stream Deck button <code>${escapeHtml(label)}</code> to run this action. The Elite checks below use persisted globals at button press time.</p>`;
      case "other":
      default:
        return `<p>Add the ordinary Streamer.bot trigger <code>${escapeHtml(label)}</code> to this action. Use persisted <code>~ed…~</code> globals for Elite state because this trigger does not carry watcher event arguments.</p>`;
    }
  }

  function testInstruction() {
    switch (state.trigger.type) {
      case "journal":
        return state.trigger.event === "__any__"
          ? "Cause any new journal event in game. Testing the action by itself will not create watcher event arguments."
          : `Cause a real ${escapeHtml(state.trigger.event)} event in game. Testing the action by itself will not create the event's <code>%edEvent_…%</code> arguments.`;
      case "flag":
        return `Change the real ${escapeHtml(splitCamel(state.trigger.flag))} state so it turns ${state.trigger.edge}. The first Status.json read establishes a quiet baseline, so a real change must happen after the watcher is running.`;
      case "companion":
        return `Cause gameplay that rewrites ${state.trigger.companion === "Any file" ? "a companion JSON file" : `${escapeHtml(state.trigger.companion)}.json`}. The initial file scan is quiet; the trigger fires on a later update.`;
      case "watcher":
        return state.trigger.watcherStatus === "error"
          ? "Use the action after a genuine watcher error, or temporarily build against a less destructive status such as started while verifying the rest of the action."
          : "Restart or operate the watcher so the selected status occurs, then inspect the resulting action run.";
      case "external":
      default:
        return `Run ${escapeHtml(state.trigger.externalLabel || "the selected trigger")}. Because this build uses persisted globals, you can also right-click the action and test it after the watcher has populated its state.`;
    }
  }

  function outcomePath(outcome) {
    switch (outcome.type) {
      case "tts": return "Speaker.bot → Speak";
      case "chat":
        return outcome.platform === "YouTube"
          ? "YouTube → Send Message to Channel"
          : `${outcome.platform || "Twitch"} → Chat → Send Message to Channel`;
      case "obs": return "OBS Studio → Sources → Set Source Visibility State";
      case "run-action": return "Core → Actions → Run Action";
      case "keyboard": return "Core → System → Keyboard Press";
      case "custom": return outcome.searchName ? `Search Sub-Actions for “${outcome.searchName}”` : "Choose the sub-action you want";
      case "sound":
      default: return "Core → Sounds → Play Sound";
    }
  }

  function outcomeSettings(outcome) {
    switch (outcome.type) {
      case "tts":
        return [`Text: ${outcome.message || "(enter text)"}`];
      case "chat":
        return [`Message: ${outcome.message || "(enter message)"}`];
      case "obs":
        return [
          `Scene: ${outcome.scene || "(choose scene)"}`,
          `Source: ${outcome.source || "(choose source)"}`,
          `State: ${outcome.obsState || "Visible"}`
        ];
      case "run-action":
        return [`Action: ${outcome.actionName || "(choose action)"}`];
      case "keyboard":
        return [`Key: ${outcome.key || "(choose key)"}`];
      case "custom":
        return [
          outcome.searchName ? `Find: ${outcome.searchName}` : "Choose the desired sub-action",
          outcome.notes ? `Notes: ${outcome.notes}` : ""
        ].filter(Boolean);
      case "sound":
      default:
        return [
          `Sound file: ${outcome.file || "(choose file)"}`,
          `Volume: ${outcome.volume || "100"}`,
          `Finish before continuing: ${outcome.wait ? "On" : "Off"}`
        ];
    }
  }

  function outcomeSettingsHtml(outcome) {
    return outcomeSettings(outcome)
      .map((setting) => {
        const separator = setting.indexOf(":");
        if (separator < 0) return escapeHtml(setting);
        const label = setting.slice(0, separator);
        const value = setting.slice(separator + 1).trim();
        return `<strong>${escapeHtml(label)}:</strong> <code>${escapeHtml(value)}</code>`;
      })
      .join("<br>");
  }

  function buildActionTree(allConditions) {
    const lines = [];
    lines.push(treeLine(0, "Trigger", "is-trigger"));
    lines.push(treeLine(1, triggerPath(), "is-trigger"));
    lines.push(treeLine(0, "Sub-Actions", "is-trigger"));

    if (!allConditions.length) {
      state.outcomes.forEach((outcome) => {
        lines.push(treeLine(1, outcomePath(outcome), "is-outcome"));
        outcomeSettings(outcome).forEach((setting) => lines.push(treeLine(2, setting, "is-muted")));
      });
      return lines.join("");
    }

    allConditions.forEach((condition, index) => {
      const depth = index + 1;
      lines.push(treeLine(depth, `If/Else ${index + 1}${condition.automatic ? " (automatic filter)" : ""}`, "is-condition"));
      lines.push(treeLine(depth + 1, `Input: ${condition.input}`, "is-muted"));
      lines.push(treeLine(depth + 1, `Operator: ${condition.operator}`, "is-muted"));
      if (condition.operator !== "Is Null or Empty") {
        lines.push(treeLine(depth + 1, `Value: ${condition.value || "…"}`, "is-muted"));
      }
      lines.push(treeLine(depth + 1, "True Result", "is-condition"));
    });

    const outcomeDepth = allConditions.length + 2;
    state.outcomes.forEach((outcome) => {
      lines.push(treeLine(outcomeDepth, outcomePath(outcome), "is-outcome"));
      outcomeSettings(outcome).forEach((setting) => lines.push(treeLine(outcomeDepth + 1, setting, "is-muted")));
    });
    lines.push(treeLine(1, "All False Results: leave empty", "is-muted"));
    return lines.join("");
  }

  function treeLine(depth, text, className) {
    const branch = depth === 0 ? "" : `${"│  ".repeat(Math.max(0, depth - 1))}└─`;
    return `
      <div class="tree-line">
        <span class="tree-branch">${escapeHtml(branch)}</span>
        <span class="tree-label ${className}">${escapeHtml(text)}</span>
      </div>`;
  }

  function getUsedVariables() {
    const byToken = new Map();
    const catalog = getVariableGroups().flatMap((group) => group.variables);

    getAllConditions().forEach((condition) => {
      byToken.set(condition.token, variableFromToken(condition.token, catalog, {
        label: condition.label,
        source: condition.source,
        description: condition.description,
        type: condition.type
      }));
    });

    state.outcomes.forEach((outcome) => {
      outcomeTextValues(outcome).forEach((text) => {
        extractTokens(text).forEach((token) => {
          if (!byToken.has(token)) byToken.set(token, variableFromToken(token, catalog));
        });
      });
    });

    return [...byToken.values()];
  }

  function getAvailableVariables() {
    const values = [...getTriggerVariables()];
    const add = (item) => {
      if (item && !values.some((existing) => existing.token === item.token)) values.push(item);
    };
    const globalMap = new Map(GLOBAL_GROUPS.flatMap((group) => group.variables).map((item) => [item.key, item]));

    ["global:edSystem", "global:edStation", "global:edCmdr", "global:edShip"].forEach((key) => add(globalMap.get(key)));

    if (state.trigger.type === "journal") {
      getMirrorVariables().slice(0, 5).forEach(add);
      if (state.trigger.event === "FSDJump") {
        ["global:edJumps", "global:edDistanceLy", "global:edNavRemainingJumps", "global:edFuelLevel"].forEach((key) => add(globalMap.get(key)));
      } else if (state.trigger.event === "Docked" || state.trigger.event === "Undocked" || state.trigger.event === "Location") {
        ["global:edDocked", "global:edLastEvent"].forEach((key) => add(globalMap.get(key)));
      } else if (state.trigger.event === "Bounty") {
        ["global:edBounties", "global:edBountyEarnings", "global:edCreditsEarned"].forEach((key) => add(globalMap.get(key)));
      } else if (state.trigger.event === "Scan") {
        ["global:edBodiesScanned", "global:edFirstDiscoveries"].forEach((key) => add(globalMap.get(key)));
      }
    }

    if (state.trigger.type === "flag") {
      add(globalMap.get(`global:ed${state.trigger.flag}`));
      ["global:edFuelLevel", "global:edCargoTons", "global:edLegalState"].forEach((key) => add(globalMap.get(key)));
    }

    if (state.trigger.type === "companion") {
      if (state.trigger.companion === "Cargo") {
        add(globalMap.get("global:edCargoUsed"));
        add(globalMap.get("global:edCargoTons"));
        add(variable("synthetic:file-cargo", "~edFileCargo_Count~", "Cargo file count", "number", "Top-level Count field from Cargo.json.", "Companion-file global"));
      } else if (state.trigger.companion === "NavRoute") {
        ["global:edNavTargetSystem", "global:edNavDestination", "global:edNavRemainingJumps"].forEach((key) => add(globalMap.get(key)));
      } else if (state.trigger.companion !== "Any file") {
        add(variable(
          `synthetic:file-${state.trigger.companion}`,
          `~edFile${sanitizeName(state.trigger.companion)}_<Field>~`,
          `${state.trigger.companion} file field`,
          "string",
          "Replace <Field> with a flattened top-level field name.",
          "Companion-file global"
        ));
      }
    }

    if (state.trigger.type === "external") {
      ["global:edDocked", "global:edJumps", "global:edCreditsEarned", "global:edNavRemainingJumps"].forEach((key) => add(globalMap.get(key)));
    }

    return values.slice(0, 24);
  }

  function getInsertableVariables() {
    const values = [...getTriggerVariables(), ...getAvailableVariables()];
    const deduped = [];
    const seen = new Set();
    values.forEach((item) => {
      if (seen.has(item.token)) return;
      seen.add(item.token);
      deduped.push(item);
    });
    return deduped.length ? deduped : GLOBAL_GROUPS[0].variables;
  }

  function variableFromToken(token, catalog, fallback = {}) {
    const found = catalog.find((item) => item.token === token);
    if (found) return found;
    const isGlobal = token.startsWith("~");
    return variable(
      `token:${token}`,
      token,
      fallback.label || splitCamel(stripVariableWrapper(token).replace(/^ed/, "")),
      fallback.type || "string",
      fallback.description || (isGlobal ? "Persisted global used in the generated action." : "Argument used in the generated action."),
      fallback.source || (isGlobal ? "Persisted global" : "Argument")
    );
  }

  function outcomeTextValues(outcome) {
    return [outcome.message, outcome.notes, outcome.scene, outcome.source, outcome.actionName, outcome.searchName].filter(Boolean);
  }

  function extractTokens(text) {
    const matches = String(text || "").match(/%[^%\r\n]+%|~[^~\r\n]+~/g);
    return matches || [];
  }

  function validateBuild() {
    const errors = [];
    const warnings = [];

    if (!state.actionName.trim()) errors.push("Enter an action name.");
    if (!state.outcomes.length) errors.push("Add at least one result sub-action.");

    state.conditions.forEach((condition, index) => {
      const resolved = resolveCondition(condition);
      const displayIndex = index + 1;

      if (condition.variableKey.startsWith("custom:") && !condition.customName.trim()) {
        errors.push(`Condition ${displayIndex} needs a variable or field name.`);
      }
      if (condition.variableKey === "custom:token" && condition.customName.trim()) {
        const token = condition.customName.trim();
        const valid = (/^%[^%]+%$/).test(token) || (/^~[^~]+~$/).test(token);
        if (!valid) errors.push(`Condition ${displayIndex}'s custom token must use %argument% or ~persistedGlobal~ syntax.`);
      }
      if (condition.operator !== "Is Null or Empty" && !String(condition.value).trim()) {
        errors.push(`Condition ${displayIndex} needs a comparison value.`);
      }
      if (resolved.token.startsWith("%edEvent_") && state.trigger.type !== "journal") {
        errors.push(`Condition ${displayIndex} uses an event argument, but the selected trigger is not a journal event.`);
      }
      if (["%edFlag%", "%edValue%"].includes(resolved.token) && state.trigger.type !== "flag") {
        errors.push(`Condition ${displayIndex} uses a ship-flag argument, but the selected trigger is not a ship-state change.`);
      }
      if (resolved.token.startsWith("%edCompanion") && state.trigger.type !== "companion") {
        errors.push(`Condition ${displayIndex} uses a companion-file argument, but the selected trigger is different.`);
      }
      if (["%edStatus%", "%edMessage%", "%edJournalFile%"].includes(resolved.token) && state.trigger.type !== "watcher") {
        errors.push(`Condition ${displayIndex} uses a watcher-status argument, but the selected trigger is different.`);
      }
    });

    state.outcomes.forEach((outcome, index) => {
      const number = index + 1;
      if (outcome.type === "sound" && !outcome.file.trim()) warnings.push(`Sub-action ${number}: choose a sound file.`);
      if (outcome.type === "tts" && !outcome.message.trim()) warnings.push(`Sub-action ${number}: enter the text to speak.`);
      if (outcome.type === "chat" && !outcome.message.trim()) warnings.push(`Sub-action ${number}: enter the chat message.`);
      if (outcome.type === "obs" && (!outcome.scene.trim() || !outcome.source.trim())) warnings.push(`Sub-action ${number}: choose both the OBS scene and source.`);
      if (outcome.type === "run-action" && !outcome.actionName.trim()) warnings.push(`Sub-action ${number}: choose the action to run.`);
      if (outcome.type === "keyboard" && !outcome.key.trim()) warnings.push(`Sub-action ${number}: choose the key or shortcut.`);
      if (outcome.type === "custom" && !outcome.searchName.trim()) warnings.push(`Sub-action ${number}: name the sub-action you want to add.`);
    });

    if (state.trigger.type === "journal" && state.trigger.event === "__any__") {
      warnings.push("Any Journal Event fires very often. Add an event-name or field condition unless that volume is intentional.");
    }
    if (state.trigger.type === "external" && !state.trigger.externalLabel.trim()) {
      warnings.push("Name the command, hotkey, timer, or ordinary trigger you will connect.");
    }
    if (state.outcomes.some((outcome) => /C:\\Sounds\\/i.test(outcome.file || ""))) {
      warnings.push("Replace the example sound path with a file that exists on the Streamer.bot computer.");
    }

    return { errors: uniqueStrings(errors), warnings: uniqueStrings(warnings) };
  }

  function buildGuideText() {
    const allConditions = getAllConditions();
    const lines = [
      "ELITE DANGEROUS STREAMER.BOT ACTION SETUP",
      "",
      `Action name: ${state.actionName || "(enter an action name)"}`,
      `Trigger: ${triggerPath()}`,
      "",
      "1. Confirm the standalone ED Journal Watcher C# action is compiled, precompiled on application start, and running.",
      `2. Create a Streamer.bot action named "${state.actionName || "(enter an action name)"}".`,
      `3. Connect this trigger: ${triggerPath()}.`
    ];

    if (allConditions.length) {
      lines.push("4. Add Core → Logic → If/Else conditions in this order. Put each later condition inside the previous True Result:");
      allConditions.forEach((condition, index) => {
        lines.push(
          `   ${index + 1}. Input ${condition.input} | Operator ${condition.operator}` +
          (condition.operator === "Is Null or Empty" ? "" : ` | Value ${condition.value}`) +
          ` | Auto Type ${condition.autoType ? "On" : "Off"}`
        );
      });
      lines.push("   Leave False Result groups empty.");
      lines.push("5. Inside the final True Result, add:");
    } else {
      lines.push("4. No If/Else is needed.");
      lines.push("5. Add these sub-actions at the root:");
    }

    state.outcomes.forEach((outcome, index) => {
      lines.push(`   ${index + 1}. ${outcomePath(outcome)}`);
      outcomeSettings(outcome).forEach((setting) => lines.push(`      - ${setting}`));
    });

    lines.push("");
    lines.push("VARIABLES USED");
    const used = getUsedVariables();
    if (used.length) {
      used.forEach((item) => lines.push(`- ${item.token}: ${item.label} (${item.source})`));
    } else {
      lines.push("- None");
    }
    lines.push("");
    lines.push("TEST");
    lines.push(stripHtml(testInstruction()));
    lines.push("Inspect the completed run in Action Queues → Action History → Inspect Variables After Run.");
    lines.push("");
    lines.push("Reference: https://tannermidd.github.io/elite-dangerous-streambot/subactions.html");
    return lines.join("\n");
  }

  function buildVariablesText() {
    const used = getUsedVariables();
    const available = getAvailableVariables();
    const lines = ["VARIABLES USED BY THIS ACTION"];
    if (used.length) {
      used.forEach((item) => lines.push(`${item.token} — ${item.label} — ${item.description}`));
    } else {
      lines.push("None");
    }
    lines.push("", "USEFUL VALUES FROM THIS TRIGGER");
    available.forEach((item) => lines.push(`${item.token} — ${item.label} — ${item.description}`));
    return lines.join("\n");
  }

  function buildShareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("build", encodePayload({
      version: 1,
      actionName: state.actionName,
      trigger: state.trigger,
      conditions: state.conditions.map(stripId),
      outcomes: state.outcomes.map(stripId)
    }));
    url.hash = "";
    return url.toString();
  }

  function loadSharedState() {
    try {
      const payload = new URL(window.location.href).searchParams.get("build");
      if (!payload) return null;
      activePreset = null;
      return decodePayload(payload);
    } catch (error) {
      console.warn("Could not load shared action build:", error);
      return null;
    }
  }

  function encodePayload(value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decodePayload(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function stripId(item) {
    const clone = { ...item };
    delete clone.id;
    return clone;
  }

  function insertVariable(button) {
    const outcome = findOutcome(button.dataset.outcomeId);
    if (!outcome) return;
    const select = document.querySelector(`[data-insert-select="${outcome.id}"]`);
    if (!select) return;
    const token = select.value;
    const property = button.dataset.targetProp;
    const current = String(outcome[property] || "");
    outcome[property] = current && !/\s$/.test(current) ? `${current} ${token}` : `${current}${token}`;
    activePreset = null;
    renderOutcomes();
    renderOutputs();
    announce(`${token} inserted.`);
  }

  function copyText(text, successMessage) {
    const finish = () => announce(successMessage);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(finish).catch(() => fallbackCopy(text, finish));
    } else {
      fallbackCopy(text, finish);
    }
  }

  function fallbackCopy(text, finish) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      finish();
    } catch {
      announce("Copy failed. Select the generated setup and copy it manually.");
    }
    textarea.remove();
  }

  function announce(message) {
    clearTimeout(copyStatusTimer);
    elements.copyStatus.textContent = message;
    copyStatusTimer = setTimeout(() => {
      elements.copyStatus.textContent = "";
    }, 3200);
  }

  function findCondition(id) {
    return state.conditions.find((item) => String(item.id) === String(id));
  }

  function findOutcome(id) {
    return state.outcomes.find((item) => String(item.id) === String(id));
  }

  function triggerVariableGroupLabel() {
    switch (state.trigger.type) {
      case "flag": return "Ship-state trigger arguments";
      case "companion": return "Companion-file trigger arguments";
      case "watcher": return "Watcher-status trigger arguments";
      case "journal": return state.trigger.event === "__any__" ? "Journal trigger arguments" : `${state.trigger.event} trigger arguments`;
      default: return "Trigger arguments";
    }
  }

  function operatorsForType(type) {
    if (type === "number") return NUMBER_OPERATORS;
    if (type === "boolean") return BOOLEAN_OPERATORS;
    return STRING_OPERATORS;
  }

  function defaultOperator(type) {
    if (type === "number") return "Greater Than";
    if (type === "boolean") return "Equals";
    return "Equals (Ignore Case)";
  }

  function normalizeBoolean(value) {
    return String(value).toLowerCase() === "false" ? "False" : "True";
  }

  function sanitizeName(value) {
    return String(value || "").replace(/[^A-Za-z0-9_]/g, "");
  }

  function stripVariableWrapper(value) {
    return String(value || "").trim().replace(/^([%~])/, "").replace(/([%~])$/, "");
  }

  function option(value, label, selected) {
    return `<option value="${escapeAttr(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function stripHtml(value) {
    const temp = document.createElement("div");
    temp.innerHTML = value;
    return temp.textContent || "";
  }

  function uniqueStrings(values) {
    return [...new Set(values)];
  }
})();
