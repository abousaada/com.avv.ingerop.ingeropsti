sap.ui.define(['sap/ui/core/mvc/Controller'],
    function (Controller) {
        'use strict';

        return Controller.extend('com.avv.ingerop.ingeropsti.ext.Budget', {
            /**
             * Called when a controller is instantiated and its View controls (if available) are already created.
             * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
             * @memberOf com.avv.ingerop.ingeropsti.ext.Budget
             */
            onInit: function () {
                this.initBudgetModificationsModel();

                // Initialize event handlers
                this.initEventHandlers();
            },
            /**
             * Similar to onAfterRendering, but this hook is invoked before the controller's View is re-rendered
             * (NOT before the first rendering! onInit() is used for that one!).
             * @memberOf com.avv.ingerop.ingeropsti.ext.Budget
             */
            //	onBeforeRendering: function() {
            //
            //	},
            /**
             * Called when the View has been rendered (so its HTML is part of the document). Post-rendering manipulations of the HTML could be done here.
             * This hook is the same one that SAPUI5 controls get after being rendered.
             * @memberOf com.avv.ingerop.ingeropsti.ext.Budget
             */
            //	onAfterRendering: function() {
            //
            //	},
            /**
             * Called when the Controller is destroyed. Use this one to free resources and finalize activities.
             * @memberOf com.avv.ingerop.ingeropsti.ext.Budget
             */
            //	onExit: function() {
            //
            //	}


            onAddBudgetLine: async function (oEvent) {
                const oView = this.getView();
                const oContext = oView.getBindingContext();
                const sModel = oContext.getModel();
                const sPath = oContext.getPath();

                var business_no_p = sModel.getProperty(sPath + "/business_no_p");
                var IdFormulaire = sModel.getProperty(sPath + "/id_formulaire");

                if (!business_no_p) {
                    MessageBox.error(
                        "Veuillez d'abord générer le N°Affaire Partenaire (Fille ou petite) avant d'ajouter une ligne de budget.",
                        { title: "N°Affaire Partenaire Manquant" }
                    );
                    return;
                }

                // Check if we're in avenant mode
                const oUIModel = oView.getModel("ui");
                const bIsAvnant = oUIModel ? oUIModel.getProperty("/isAvnant") : false;

                var business_sdate_e = sModel.getProperty(sPath + "/business_e_SDate");
                var business_edate_e = sModel.getProperty(sPath + "/business_e_EDate");
                var business_e_currency = sModel.getProperty(sPath + "/business_e_currency");

                var aMissions = this.getView().getModel("missions").getProperty("/results");

                // Check 99 lines limit
                var oModel = this.getView().getModel("budget");
                var aData = oModel.getProperty("/results") || [];

                // Count existing lines for this business_no_p
                var existingLinesCount = 0;
                aData.forEach(function (item) {
                    if (item.business_no_p === business_no_p) {
                        existingLinesCount++;
                    }
                });

                // Block if reaching 99 lines
                if (existingLinesCount >= 99) {
                    MessageBox.error(
                        "La limite maximale de 99 lignes de budget a été atteinte. Impossible d'ajouter une nouvelle ligne.",
                        { title: "Limite de Lignes Atteinte" }
                    );
                    return;
                }

                // Get default mission if available
                var sMission_e = "";
                var sRegroupement = "";
                var sMissionCode = "";
                var sStatutmission = "";

                if (aMissions.length > 0) {
                    sMission_e = aMissions[0].MissionId;
                    sRegroupement = aMissions[0].Regroupement;
                    sMissionCode = aMissions[0].MissionCode;
                    sStatutmission = aMissions[0].statutmission;
                }

                // NEW LOGIC: Different Mission_p generation based on avenant mode
                var newMissionP;
                var nextIdM;

                if (bIsAvnant) {
                    // In avenant mode: use ## instead of incrementing
                    newMissionP = business_no_p + "##";
                    nextIdM = "##";
                } else {
                    // Regular mode: increment as before - FIXED LOGIC
                    var maxSuffix = 0;
                    aData.forEach(function (item) {
                        if (item.Mission_p && item.business_no_p === business_no_p) {
                            // Only process items with the same business_no_p
                            /*if (item.Mission_p.includes('##')) {
                                // Skip ## lines in avenant mode for max suffix calculation
                                return;
                            }*/

                            // Extract suffix (last 2 characters of Mission_p)
                            var missionPWithoutBusiness = item.Mission_p.substring(business_no_p.length);

                            // Try to parse as number
                            var numericSuffix = parseInt(missionPWithoutBusiness, 10);

                            if (!isNaN(numericSuffix) && numericSuffix > maxSuffix) {
                                maxSuffix = numericSuffix;
                            }
                        }
                    });

                    var newSuffix = maxSuffix + 1;
                    var formattedSuffix = newSuffix.toString().padStart(2, '0');
                    newMissionP = business_no_p + formattedSuffix;
                    nextIdM = formattedSuffix;
                }

                var oNewLine = {
                    Mission_e: sMission_e,
                    Mission_p: newMissionP,
                    Regroupement: sRegroupement,
                    astatutmission: sStatutmission,
                    MissionCode: sMissionCode,
                    StartDate: business_sdate_e,
                    EndDate: business_edate_e,
                    business_no_p: business_no_p,
                    BudgetAlloue: '0',
                    Currency: business_e_currency,
                    Mission_p_sec: nextIdM,
                    isNew: true,
                    // Add flag to identify avenant new lines
                    isAvenantNewLine: bIsAvnant
                };

                aData.push(oNewLine);
                oModel.setProperty("/results", aData);

                // Log for debugging
                console.log("Added new line in " + (bIsAvnant ? "Avenant" : "Regular") + " mode: ", oNewLine);
                console.log("Current data count: " + aData.length);

                // Log all Mission_p values for debugging
                aData.forEach(function (item, index) {
                    console.log("Item " + index + ": " + item.Mission_p + " (business_no_p: " + item.business_no_p + ")");
                });
            },


            onMissionChange: function (oEvent) {
                var oSelect = oEvent.getSource();
                var oRow = oSelect.getParent();
                var oBindingContext = oRow.getBindingContext("budget");
                var oSelectedItem = oEvent.getParameter("selectedItem");
                var sSelectedKey = oSelectedItem ? oSelectedItem.getKey() : null;

                if (oBindingContext && sSelectedKey) {
                    // Get the missions model to find the selected mission's regroupement
                    var aMissions = this.getView().getModel("missions").getProperty("/results");
                    var oSelectedMission = aMissions.find(function (mission) {
                        return mission.MissionId === sSelectedKey;
                    });

                    if (oSelectedMission) {
                        // Update both Mission_e and Regroupement fields
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/Mission_e", sSelectedKey);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/Regroupement", oSelectedMission.Regroupement);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/MissionCode", oSelectedMission.MissionCode);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/statutmission", oSelectedMission.statutmission);

                    }
                }
            },

            isLineEditable: function (bIsNew) {
                //return bIsNew === true;
                var oUIModel = this.getView().getModel("ui");
                return oUIModel ? oUIModel.getProperty("/editable") : false;

            },

            formatCellEditable: function (bIsNew, sMissionP, bIsAvnant) {

                // Check if it's a new avenant line (contains ##)
                const isNewAvenantLine = sMissionP && sMissionP.includes('##');

                // If it's a new line (regular or avenant), it should be editable
                if (bIsNew === true || isNewAvenantLine) {
                    return true;
                }

                // If it's an avenant but Mission_p doesn't contain '#', make it read-only
                if (bIsAvnant && sMissionP && !sMissionP.includes('#')) {
                    return false;
                }

                // Default: not editable
                return false;
            },

            enableAddLine: function (bEditable, aMissions) {
                return bEditable && Array.isArray(aMissions) && aMissions.length > 0;
            },

            onAfterRendering: function () {
                var oTable = this.byId("budgetTable");
                var aItems = oTable.getItems();

                aItems.forEach(function (oItem, index) {
                    var oSelect = oItem.getCells()[0];
                    var sSelectedKey = oSelect.getSelectedKey();
                    var oBindingContext = oItem.getBindingContext("budget");
                    var sModelValue = oBindingContext.getProperty("Mission_e");

                    console.log("Row " + index + " - Select key:", sSelectedKey, "Model value:", sModelValue);

                    if (sSelectedKey !== sModelValue) {
                        console.warn("MISMATCH in row " + index);
                        oSelect.setSelectedKey(sModelValue);
                    }
                });
            },


            onDeleteBudgetLine: function (oEvent) {
                var oButton = oEvent.getSource();
                var oContext = oButton.getBindingContext("budget");

                if (!oContext) return;

                var sPath = oContext.getPath();

                var oModel = this.getView().getModel("budget");
                var aData = oModel.getProperty("/results");

                var iIndex = parseInt(sPath.split("/").pop());

                aData.splice(iIndex, 1);

                oModel.setProperty("/results", aData);

                sap.ui.getCore().getEventBus().publish("budget", "budgetLineDeleted");


            },

            _callZGET_IDAction: function (type, idFormulaire) {
                return new Promise((resolve, reject) => {
                    try {
                        const oModel = this.getView().getModel();

                        // Prepare the parameter object
                        const oParams = {
                            IV_TYPE: type,
                            iv_IdFormulaire: idFormulaire
                        };

                        // Call the action with parameters
                        oModel.callFunction("/ZGET_ID", {
                            method: "POST", // Usually POST for actions with parameters
                            urlParameters: oParams,
                            success: (oData) => {
                                console.log("ZGET_ID action successful:", oData);
                                resolve(oData.ZGET_ID.ZGenId);
                            },
                            error: (oError) => {
                                console.error("Error calling ZGET_ID action:", oError);
                                reject(oError);
                            }
                        });
                    } catch (error) {
                        console.error("Unexpected error in _callZGET_IDAction:", error);
                        reject(error);
                    }
                });
            },

        initEventHandlers: function () {
            // Listen for budget table row selection
            var oTable = this.byId("budgetTable");
            if (oTable) {
                oTable.attachSelectionChange(this.onBudgetTableSelectionChange.bind(this));
            }
        },

onBudgetTableSelectionChange: function (oEvent) {
            var aSelectedItems = oEvent.getSource().getSelectedItems();
            
            if (aSelectedItems.length > 0) {
                var oSelectedItem = aSelectedItems[0];
                var oBindingContext = oSelectedItem.getBindingContext("budget");
                
                if (oBindingContext) {
                    // Store the selected budget line in UI model
                    var oSelectedBudgetLine = {
                        Mission_p: oBindingContext.getProperty("Mission_p"),
                        Mission_e: oBindingContext.getProperty("Mission_e"),
                        Currency: oBindingContext.getProperty("Currency"),
                        Libelle: oBindingContext.getProperty("Libelle"),
                        Regroupement: oBindingContext.getProperty("Regroupement")
                    };
                    
                    var oUIModel = this.getView().getModel("ui");
                    if (oUIModel) {
                        oUIModel.setProperty("/selectedBudgetLine", oSelectedBudgetLine);
                        console.log("Budget line selected:", oSelectedBudgetLine);
                    }
                }
            }
        },

            onBudgetRowSelected: function (oEvent) {
                var oSelectedItem = oEvent.getParameter("row");
                if (oSelectedItem) {
                    var oBindingContext = oSelectedItem.getBindingContext("budget");
                    if (oBindingContext) {
                        var sMissionP = oBindingContext.getProperty("Mission_p");
                        var sMissionE = oBindingContext.getProperty("Mission_e");
                        var sCurrency = oBindingContext.getProperty("Currency");

                        // Store the selected budget line for quick addition to modifications
                        this.getView().getModel("ui").setProperty("/selectedBudgetLine", {
                            Mission_p: sMissionP,
                            Mission_e: sMissionE,
                            Currency: sCurrency
                        });
                    }
                }
            },

            onAddBudgetModificationLine: function () {
            const oView = this.getView();
            const oUIModel = oView.getModel("ui");
            const bEditable = oUIModel ? oUIModel.getProperty("/editable") : false;

            if (!bEditable) {
                MessageBox.warning("Vous n'êtes pas en mode édition.");
                return;
            }

            // Check if there are any budget lines to modify
            var oBudgetModel = this.getView().getModel("budget");
            var aBudgetLines = oBudgetModel.getProperty("/results") || [];

            if (aBudgetLines.length === 0) {
                MessageBox.warning(
                    "Aucune ligne de budget n'est disponible pour modification. Veuillez d'abord créer des lignes de budget.",
                    { title: "Aucune Ligne de Budget" }
                );
                return;
            }

            // Get selected budget line from UI model
            var oSelectedBudgetLine = null;
            if (oUIModel) {
                oSelectedBudgetLine = oUIModel.getProperty("/selectedBudgetLine");
            }

            var oModel = this.getView().getModel("budgetModifications");
            var aData = oModel.getProperty("/results") || [];

            // Create new modification line
            var oNewModification = {
                CreationDate: this.getCurrentDate(),
                MissionReceptrice: "", // Will be selected from dropdown
                MissionEmettrice: "",  // Will be selected from dropdown
                AjustementBudget: "",
                Devise: "",
                isNew: true
            };

            // If a budget line is selected in the table, pre-fill Mission réceptrice
            if (oSelectedBudgetLine && oSelectedBudgetLine.Mission_p) {
                oNewModification.MissionReceptrice = oSelectedBudgetLine.Mission_p;
                oNewModification.MissionEmettrice = oSelectedBudgetLine.Mission_e || "";
                oNewModification.Devise = oSelectedBudgetLine.Currency || "";
                
                console.log("Pre-filling modification with selected budget line:", oSelectedBudgetLine);
            }

            aData.push(oNewModification);
            oModel.setProperty("/results", aData);
        },

         
            formatBudgetLineText: function (sMissionP, sMissionE) {
                if (!sMissionP || !sMissionE) return "";
                return sMissionP + " (émettrice: " + sMissionE + ")";
            },


            onBudgetLineSelected: function (oEvent) {
                var oSelect = oEvent.getSource();
                var sSelectedKey = oSelect.getSelectedKey();
                var oBindingContext = oSelect.getBindingContext("budgetModifications");

                if (oBindingContext && sSelectedKey) {
                    // Find the selected budget line from the budget table
                    var oBudgetModel = this.getView().getModel("budget");
                    var aBudgetLines = oBudgetModel.getProperty("/results") || [];
                    var oSelectedBudgetLine = aBudgetLines.find(function (line) {
                        return line.Mission_p === sSelectedKey;
                    });

                    if (oSelectedBudgetLine) {
                        // Auto-fill the modification fields
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/SelectedBudgetLine", sSelectedKey);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/MissionReceptrice", oSelectedBudgetLine.Mission_p);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/MissionEmettrice", oSelectedBudgetLine.Mission_e);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/Devise", oSelectedBudgetLine.Currency);

                        // Store additional info for reference
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/BudgetLineData", oSelectedBudgetLine);
                    }
                }
            },



            getValidatedMissions: function () {
                // This should be implemented to fetch validated missions
                // For now, using mock data
                return [
                    {
                        MissionId: "MISSION-001",
                        MissionName: "Mission Alpha",
                        Currency: "EUR",
                        IsValidated: true
                    },
                    {
                        MissionId: "MISSION-002",
                        MissionName: "Mission Beta",
                        Currency: "USD",
                        IsValidated: true
                    },
                    {
                        MissionId: "MISSION-003",
                        MissionName: "Mission Gamma",
                        Currency: "EUR",
                        IsValidated: true
                    }
                ];
            },

            updateMissionPairs: function () {
                const aMissions = this.getValidatedMissions();
                const aPairs = [];

                // Create all possible pairs
                for (let i = 0; i < aMissions.length; i++) {
                    for (let j = 0; j < aMissions.length; j++) {
                        if (i !== j) { // Exclude self-pairs
                            aPairs.push({
                                emitter: aMissions[i].MissionId,
                                receiver: aMissions[j].MissionId,
                                emitterName: aMissions[i].MissionName,
                                receiverName: aMissions[j].MissionName
                            });
                        }
                    }
                }

                const oMissionPairsModel = this.getView().getModel("missionPairs");
                oMissionPairsModel.setProperty("/pairs", aPairs);
            },


            onMissionPairChange: function (oEvent) {
                const oSelect = oEvent.getSource();
                const sSelectedKey = oSelect.getSelectedKey();
                const oBindingContext = oSelect.getBindingContext("budgetModifications");

                if (oBindingContext && sSelectedKey) {
                    const aMissions = sSelectedKey.split("|");
                    if (aMissions.length === 2) {
                        const [sEmitter, sReceiver] = aMissions;

                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/MissionPairId", sSelectedKey);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/MissionEmettrice", sEmitter);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/MissionReceptrice", sReceiver);

                        // Set currency from receiving mission
                        const sCurrency = this.getMissionCurrency(sReceiver);
                        oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/Devise", sCurrency);
                    }
                }
            },

            getMissionCurrency: function (sMissionId) {
                const aMissions = this.getValidatedMissions();
                const oMission = aMissions.find(m => m.MissionId === sMissionId);
                return oMission ? oMission.Currency : "";
            },

            isModificationLineEditable: function (bIsNew, sMissionPairId) {
                const oUIModel = this.getView().getModel("ui");
                const bEditable = oUIModel ? oUIModel.getProperty("/editable") : false;

                // Only editable if in edit mode and it's a new line
                return bEditable && (bIsNew === true || !sMissionPairId);
            },


            initBudgetModificationsModel: function () {
                // Create model for budget modifications
                var oModel = new sap.ui.model.json.JSONModel({
                    results: []
                });
                this.getView().setModel(oModel, "budgetModifications");
            },

            
            // When Mission réceptrice is selected
            // When Mission réceptrice is selected in modification table
        onMissionReceptriceChange: function (oEvent) {
            var oSelect = oEvent.getSource();
            var sSelectedKey = oSelect.getSelectedKey();
            var oBindingContext = oSelect.getBindingContext("budgetModifications");

            if (oBindingContext && sSelectedKey) {
                // Find the selected budget line to get its currency
                var oBudgetModel = this.getView().getModel("budget");
                var aBudgetLines = oBudgetModel.getProperty("/results") || [];
                var oSelectedBudgetLine = aBudgetLines.find(function (line) {
                    return line.Mission_p === sSelectedKey;
                });

                if (oSelectedBudgetLine) {
                    // Auto-fill the currency from the budget line
                    oBindingContext.getModel().setProperty(
                        oBindingContext.getPath() + "/Devise",
                        oSelectedBudgetLine.Currency
                    );

                    // Auto-fill Mission émettrice if not already set
                    if (oSelectedBudgetLine.Mission_e && !oBindingContext.getProperty("MissionEmettrice")) {
                        oBindingContext.getModel().setProperty(
                            oBindingContext.getPath() + "/MissionEmettrice",
                            oSelectedBudgetLine.Mission_e
                        );
                    }
                }
            }
        },


            // When Mission émettrice is selected
            onMissionEmettriceChange: function (oEvent) {
                // Nothing special needed here, just store the selection
                // You could add validation if needed
            },

            // Formatter for Mission réceptrice dropdown
            formatMissionReceptriceText: function (sMissionP, sLibelle) {
                if (!sMissionP) return "";
                var sText = sMissionP;
                if (sLibelle) {
                    sText += " - " + sLibelle;
                }
                return sText;
            },

            getCurrentDate: function () {
                const oDate = new Date();
                //return oDate.toISOString().split('T')[0]; 
                return oDate;
            },

            // Delete a modification line
            onDeleteBudgetModificationLine: function (oEvent) {
                const oButton = oEvent.getSource();
                const oContext = oButton.getBindingContext("budgetModifications");

                if (!oContext) return;

                MessageBox.confirm(
                    "Êtes-vous sûr de vouloir supprimer cette ligne de modification budgétaire ?",
                    {
                        title: "Confirmation de suppression",
                        onClose: (sAction) => {
                            if (sAction === MessageBox.Action.OK) {
                                const sPath = oContext.getPath();
                                const oModel = this.getView().getModel("budgetModifications");
                                const aData = oModel.getProperty("/results");
                                const iIndex = parseInt(sPath.split("/").pop());

                                aData.splice(iIndex, 1);
                                oModel.setProperty("/results", aData);
                            }
                        }
                    }
                );
            },

            // Validate budget adjustment
            onBudgetAdjustmentChange: function (oEvent) {
                const sValue = oEvent.getSource().getValue();

                // Validate numeric input
                if (sValue && isNaN(parseFloat(sValue))) {
                    MessageBox.warning("Veuillez saisir un montant numérique valide.");
                    oEvent.getSource().setValue("");
                }
            },

            // Validate before save
            validateModifications: function () {
                const oModel = this.getView().getModel("budgetModifications");
                const aModifications = oModel.getProperty("/results") || [];
                let bIsValid = true;
                let sErrorMessage = "";

                aModifications.forEach(function (modification, index) {
                    if (!modification.MissionReceptrice) {
                        bIsValid = false;
                        sErrorMessage = "La mission réceptrice est obligatoire pour la ligne " + (index + 1);
                        return;
                    }

                    if (!modification.MissionEmettrice) {
                        bIsValid = false;
                        sErrorMessage = "La mission émettrice est obligatoire pour la ligne " + (index + 1);
                        return;
                    }

                    if (!modification.AjustementBudget || isNaN(parseFloat(modification.AjustementBudget))) {
                        bIsValid = false;
                        sErrorMessage = "L'ajustement budgétaire est invalide pour la ligne " + (index + 1);
                        return;
                    }
                });

                if (!bIsValid) {
                    MessageBox.error(sErrorMessage);
                }

                return bIsValid;
            },

            // Get all modifications for save/update
            getBudgetModifications: function () {
                const oModel = this.getView().getModel("budgetModifications");
                return oModel.getProperty("/results") || [];
            },

            // Clear modifications (when form is reset)
            clearBudgetModifications: function () {
                const oModel = this.getView().getModel("budgetModifications");
                oModel.setProperty("/results", []);
            },


        });
    });
