sap.ui.define(['sap/ui/core/mvc/Controller'],
    function (Controller) {
        'use strict';

        return Controller.extend('com.avv.ingerop.ingeropsti.ext.Budget', {
            /**
             * Called when a controller is instantiated and its View controls (if available) are already created.
             * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
             * @memberOf com.avv.ingerop.ingeropsti.ext.Budget
             */
            //	onInit: function () {
            //
            //	},
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
                // Regular mode: increment as before
                var maxSuffix = 0;
                aData.forEach(function (item) {
                    if (item.Mission_p && item.Mission_p.startsWith(business_no_p)) {
                        // Extract numeric suffix (ignore ## lines)
                        if (item.Mission_p.includes('##')) return;
                        
                        var suffix = item.Mission_p.substring(business_no_p.length);
                        var numericSuffix = parseInt(suffix, 10);
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
        },


            onAddBudgetLine1: async function (oEvent) {
                const oView = this.getView();
                const oContext = oView.getBindingContext();
                const sModel = oContext.getModel();
                const sPath = oContext.getPath();

                var business_no_p = sModel.getProperty(sPath + "/business_no_p");
                var IdFormulaire = sModel.getProperty(sPath + "/id_formulaire");

                if (!business_no_p) {
                    sap.m.MessageBox.error(
                        "Veuillez d'abord générer le N°Affaire Partenaire (Fille ou petite) avant d'ajouter une ligne de budget.",
                        {
                            title: "N°Affaire Partenaire Manquant"
                        }
                    );
                    return;
                }

                var business_sdate_e = sModel.getProperty(sPath + "/business_e_SDate");
                var business_edate_e = sModel.getProperty(sPath + "/business_e_EDate");
                var business_e_currency = sModel.getProperty(sPath + "/business_e_currency");

                var aMissions = this.getView().getModel("missions").getProperty("/results");

                // Vérifier la limite de 99 lignes - CORRECTION ICI
                var oModel = this.getView().getModel("budget");
                var aData = oModel.getProperty("/results") || [];

                // Compter les lignes existantes pour ce business_no_p - CORRECTION ICI
                var existingLinesCount = aData.filter(function (item) {
                    return item.business_no_p === business_no_p;
                }).length;

                // Bloquer si on atteint ou dépasse 99 lignes
                if (existingLinesCount >= 99) {
                    sap.m.MessageBox.error(
                        "La limite maximale de 99 lignes de budget a été atteinte. Impossible d'ajouter une nouvelle ligne.",
                        {
                            title: "Limite de Lignes Atteinte"
                        }
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

                var maxSuffix = 0;
                aData.forEach(function (item) {
                    if (item.Mission_p && item.Mission_p.startsWith(business_no_p)) {
                        var suffix = item.Mission_p.substring(business_no_p.length);
                        var numericSuffix = parseInt(suffix, 10);
                        if (!isNaN(numericSuffix) && numericSuffix > maxSuffix) {
                            maxSuffix = numericSuffix;
                        }
                    }
                });

                var newSuffix = maxSuffix + 1;
                var formattedSuffix = newSuffix.toString().padStart(2, '0');
                var newMissionP = business_no_p + formattedSuffix;

                var nextIdM = formattedSuffix; //await this._callZGET_IDAction('m',IdFormulaire);

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
                    isNew: true
                };

                aData.push(oNewLine);
                oModel.setProperty("/results", aData);
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



        });
    });
