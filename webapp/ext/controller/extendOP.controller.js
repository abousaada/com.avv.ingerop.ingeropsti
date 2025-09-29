sap.ui.define(
    [
        "sap/ui/core/mvc/ControllerExtension",
        "sap/ui/core/mvc/OverrideExecution",
        "sap/ui/model/json/JSONModel",
        "sap/m/MessageToast"
    ],
    function (
        ControllerExtension, OverrideExecution, JSONModel, MessageToast
    ) {
        "use strict";
        //return ControllerExtension.extend("com.avv.ingerop.ingeropsti.ext.controller.extendOP", {
        return {

            //override: {

            onInit: async function () {
                this._getExtensionAPI().attachPageDataLoaded(this._onObjectExtMatched.bind(this));
                this._setupEnterKeyHandlers();

                sap.ui.getCore().getEventBus().subscribe("budget", "budgetLineDeleted", this._recalculateMissionBudgets, this);

            },

            beforeSaveExtension: async function (status) {

                try {
                    const that = this;
                    //const oView = this.base.getView();
                    const oView = this.getView();
                    const oContext = oView.getBindingContext();
                    const oModel = oContext.getModel();
                    const sPath = oContext.getPath();

                    oView.setBusy(true);

                    if (!oContext) {
                        sap.m.MessageBox.error("Context Error");
                        return Promise.reject("No binding context");
                    }

                    const oPayload = oContext.getObject();

                    //const nextId = await this._callZGET_IDAction();

                    var business_no_p = oModel.getProperty(sPath + "/business_no_p");
                    if (!business_no_p) {
                        await this.onGenerateId();
                        business_no_p = oModel.getProperty(sPath + "/business_no_p");
                        oPayload.business_no_p = business_no_p;
                    }

                    const aBudgetLines = this.getView().getModel("budget").getProperty("/results");
                    oPayload.to_BUDG = aBudgetLines.map(line => ({
                        BUSINESS_NO_E: oPayload.business_no_e,
                        business_no_p: oPayload.business_no_p,
                        IdFormulaire: oPayload.id_formulaire,
                        Mission_e: line.Mission_e,
                        Mission_p: line.Mission_p,
                        Libelle: line.Libelle,
                        StartDate: line.StartDate,
                        EndDate: line.EndDate,
                        BudgetAlloue: line.BudgetAlloue,
                        Currency: line.Currency,
                        MissionCode: line.MissionCode,
                        Regroupement: line.Regroupement,
                        Mission_p_sec: line.Mission_p_sec,
                        //statutmission: line.statutmission || 'A' 
                    }));

                    if (!status) {
                        status = 'DRAFT';
                    }
                    oPayload.status = status;

                    try {
                        const updatedSTI = await this.deepUpsertSTI(oPayload);

                        if (updatedSTI) {

                            var message = "STI created successfully";

                            if (status = 'DRAFT') {
                                message = "STI créée avec succès";
                            } else {
                                message = "STI validée avec succès";
                            }

                            sap.m.MessageBox.show("STI created successfully: " + updatedSTI.id_formulaire, {
                                icon: sap.m.MessageBox.Icon.SUCCESS,
                                title: "Success",
                                actions: [sap.m.MessageBox.Action.OK],
                                onClose: function () {
                                    that._recalculateMissionBudgets();

                                    oView.getModel().refresh(true);
                                    const oRouter = sap.ui.core.UIComponent.getRouterFor(oView);
                                    oRouter.navTo("ListReport");

                                    that._refreshScreenData(oView, status);

                                    oView.setBusy(false);
                                }
                            });

                        }

                    } catch (error) {
                        console.error(error);
                        return Promise.reject(error);
                    }

                    return Promise.reject();

                } catch (error) {
                    console.error(error);
                    return Promise.reject(error);
                } finally {
                    
                    oView.setBusy(false);
                }

            },


            //},

            _setupEnterKeyHandlers: function () {
                var oView = this.getView();

                oView.attachAfterRendering(function () {
                    oView.$().off('keypress', 'input').on('keypress', 'input', function (oEvent) {
                        if (oEvent.key === "Enter" || oEvent.keyCode === 13) {
                            oEvent.preventDefault();
                            this._onEnterKeyPressed(oEvent);
                            this._recalculateMissionBudgets();
                        }

                    }.bind(this));

                    const aBudgetInputs = oView.findAggregatedObjects(true, (oCtrl) => {
                        return oCtrl.isA("sap.m.Input") &&
                            oCtrl.getParent() &&
                            oCtrl.getParent().getParent() &&
                            oCtrl.getParent().getParent().isA("sap.m.ColumnListItem") &&
                            (oCtrl.getTooltip() === "Budget sous-traité (recette)" ||
                                oCtrl.getValue() && oCtrl.getValue().toString().includes("BudgetAlloue"));
                    });

                }.bind(this));
            },

            _onEnterKeyPressed: function (oEvent) {
                this.onGenerateId();
            },

            _getExtensionAPI: function () {
                return this._getController().extensionAPI;
            },

            _getController() {
                return this.getInterface().getView().getController();
            },

            _getOwnerComponent() {
                return this._getController().getOwnerComponent();
            },

            _onObjectExtMatched: async function (e) {

                const oContext = this._getController().getView().getBindingContext();
                const oModel = oContext.getModel();
                const sPath = oContext.getPath();
                const oView = this.getView();

                if (!oContext) {
                    return;
                }

                const sStatus = oModel.getProperty(sPath + "/status");
                if (sStatus === 'DRAFT') {
                    oModel.setProperty(sPath + "/status", 'En cours');
                }

                const bIsCreate = this.getView().getModel("ui").getProperty("/createMode");

                if (bIsCreate) {
                    const sNewFormulaireId = await this._calculateFormulaireId();

                    oModel.setProperty(sPath + "/id_formulaire", sNewFormulaireId);

                    let sUserId = "";
                    if (sap.ushell && sap.ushell.Container && sap.ushell.Container.getUser) {
                        sUserId = sap.ushell.Container.getUser().getId();
                    }
                    oModel.setProperty(sPath + "/proprio_sti", sUserId);
                }

                const oEntityData = oContext.getObject();

                if (!this.getView().getModel("viewModel")) {
                    this.getView().setModel(new sap.ui.model.json.JSONModel(), "viewModel");
                }

                this.getView().getModel("viewModel").setData(oEntityData);

                /*var missions = await this.getMissions();
                var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                this.getView().setModel(oMissionsModel, "missions");

                var budget = await this.getBudget();
                var oBudgetModel = new sap.ui.model.json.JSONModel({ results: budget });
                this.getView().setModel(oBudgetModel, "budget");*/

                var missions = await this.getMissions();
                var budget = await this.getBudget();

                // --- Initial calculation to display the values immediately ---
                missions.forEach(mission => {
                    const missionId = mission.MissionId;

                    // Get the ORIGINAL database BudgetInSTI value for this mission
                    const originalDatabaseBudgetInSTI = parseFloat(mission.BudgetInSTI || 0);

                    // Store the original database value for future calculations
                    mission.OriginalBudgetInSTI = originalDatabaseBudgetInSTI;

                    // Sum of BudgetAlloue for this mission from CURRENT budget table
                    const currentTableBudget = budget //
                        .filter(b => b.Mission_e === missionId && b.isNew && (b.AFFAIRE_TYPE === "" || !b.AFFAIRE_TYPE))
                        .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                    // TOTAL BudgetInSTI = Database value + Current table values
                    const totalBudgetInSTI = originalDatabaseBudgetInSTI + currentTableBudget;

                    mission.BudgetInSTI = totalBudgetInSTI.toFixed(2);
                    mission.AvailableBudget = (mission.GlobalBudget - totalBudgetInSTI).toFixed(2);

                    if (mission.GlobalBudget === "0.00") {
                        mission.SubcontractedBudgetPercentage = "0%";
                    } else {
                        mission.SubcontractedBudgetPercentage = ((totalBudgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%";
                    }
                });

                var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                this.getView().setModel(oMissionsModel, "missions");

                var oBudgetModel = new sap.ui.model.json.JSONModel({ results: budget });
                this.getView().setModel(oBudgetModel, "budget");

                var oCurrencyModel = new sap.ui.model.json.JSONModel({
                    Currencies: [
                        { key: "EUR", text: "Euro" },
                        { key: "USD", text: "US Dollar" },
                        { key: "GBP", text: "British Pound" }
                    ]
                });
                this.getView().setModel(oCurrencyModel, "currencies");


                // --- Add dynamic BudgetInSTI calculation ---
                /*this.getView().getModel("budget").attachPropertyChange(() => {
                    var budgetData = this.getView().getModel("budget").getProperty("/results");
                    var missionsData = this.getView().getModel("missions").getProperty("/results");

                    missionsData.forEach(mission => {
                        const missionId = mission.MissionId;

                        const budgetInSTI = budgetData
                            .filter(b => b.Mission_e === missionId)
                            .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                        // BudgetInSTI
                        //mission.BudgetInSTI = budgetInSTI.toFixed(2);

                        // GlobalBudget = 100
                        //mission.GlobalBudget = 100;

                        // AvailableBudget = GlobalBudget - BudgetInSTI
                        mission.AvailableBudget = (mission.GlobalBudget - budgetInSTI).toFixed(2);

                        // SubcontractedBudgetPercentage = BudgetInSTI / GlobalBudget * 100
                        if (mission.GlobalBudget === "0.00") { mission.SubcontractedBudgetPercentage = "0%" }
                        else {
                            mission.SubcontractedBudgetPercentage = ((budgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%";
                        }

                    });

                    this.getView().getModel("missions").refresh();

                });*/

                // --- Add dynamic BudgetInSTI calculation ---
                /*this.getView().getModel("budget").attachPropertyChange(() => {
                    var budgetData = this.getView().getModel("budget").getProperty("/results");
                    var missionsData = this.getView().getModel("missions").getProperty("/results");

                    missionsData.forEach(mission => {
                        const missionId = mission.MissionId;

                        // Get the ORIGINAL database value (stored during initialization)
                        const originalDatabaseBudgetInSTI = parseFloat(mission.OriginalBudgetInSTI || 0);

                        // Sum of BudgetAlloue for this mission from CURRENT budget table
                        const currentTableBudget = budgetData
                            .filter(b => b.Mission_e === missionId)
                            .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                        // TOTAL BudgetInSTI = Database value + Current table values
                        const totalBudgetInSTI = originalDatabaseBudgetInSTI + currentTableBudget;

                        // Update mission values
                        mission.BudgetInSTI = totalBudgetInSTI.toFixed(2);
                        mission.AvailableBudget = (mission.GlobalBudget - totalBudgetInSTI).toFixed(2);

                        if (mission.GlobalBudget === "0.00") {
                            mission.SubcontractedBudgetPercentage = "0%";
                        } else {
                            mission.SubcontractedBudgetPercentage = ((totalBudgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%";
                        }
                    });

                    this.getView().getModel("missions").refresh();
                });*/

                // --- Initial calculation to display the values immediately ---
                /*missions.forEach(mission => {
                    const missionId = mission.MissionId;

                    // Sum of BudgetAlloue for this mission
                    const budgetInSTI = budget
                        .filter(b => b.Mission_e === missionId)
                        .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                    mission.BudgetInSTI = budgetInSTI.toFixed(2);
                    //mission.GlobalBudget = 100;
                    mission.AvailableBudget = (mission.GlobalBudget - budgetInSTI).toFixed(2);
                    if (mission.GlobalBudget === "0.00") { mission.SubcontractedBudgetPercentage = "0%" }
                    else {
                        mission.SubcontractedBudgetPercentage = ((budgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%";
                    }
                });*/

                var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                this.getView().setModel(oMissionsModel, "missions");


                //attach event to business_no_e => get missions
                if (oContext) {
                    const oBinding = oContext.getModel().bindProperty(oContext.getPath() + "/business_no_e");

                    oBinding.attachChange((oEvent) => {
                        const sNewValue = oEvent.getSource().getValue();
                        this._onBusinessNoEChanged({ getParameter: () => sNewValue });
                    });
                }

                //attach event to business_p_cdp
                if (oContext) {
                    const oBinding = oContext.getModel().bindProperty(oContext.getPath() + "/business_p_cdp");

                    oBinding.attachChange((oEvent) => {
                        const sNewValue = oEvent.getSource().getValue();
                        this._onPartnerCDPChanged({ getParameter: () => sNewValue });
                    });
                }

                //Set visibility business_p_projm

                var sBusinessEcmp = oModel.getProperty(sPath + "/business_e_cmp");
                var sBusinessPcmp = oModel.getProperty(sPath + "/business_p_cmp");

                const aSmartFields = oView.findAggregatedObjects(true, (oCtrl) => {

                    return oCtrl.isA("sap.ui.comp.smartfield.SmartField") &&
                        oCtrl.getId().includes("business_p_projm");
                });
                aSmartFields.forEach((oSmartField) => {

                    if (!sBusinessEcmp && !sBusinessPcmp) { //&& sBusinessEcmp === sBusinessPcmp) {
                        //oSmartField.setVisible(false);
                        //} else {
                        oSmartField.setVisible(true);
                    }

                });

                // Make fields only in create mode
                this._setFieldEditableState("business_no_e", bIsCreate);
                this._setFieldEditableState("business_no_e_t", bIsCreate);
                this._setFieldEditableState("business_no_p_t", bIsCreate);
                //this._setFieldEditableState("business_p_cmp", bIsCreate);
                this._setFieldEditableState("business_p_ufo", bIsCreate);
                this._setFieldEditableState("business_p_cdp", bIsCreate);
                this._setFieldEditableState("business_p_bm", bIsCreate);
                this._setFieldEditableState("business_p_mail", bIsCreate);
                this._setFieldEditableState("business_p_projm", bIsCreate);

                this.prepareMissionsTreeData();


            },


            _setFieldEditableState: function (sFieldId, bIsCreate) {
                const oView = this.getView();
                const oUIModel = oView.getModel("ui");

                oUIModel.attachPropertyChange((oEvent) => {
                    if (oEvent.getParameter("path") === "/editable") {
                        const bNowEditable = oUIModel.getProperty("/editable");

                        const aSmartFields = oView.findAggregatedObjects(true, (oCtrl) => {
                            return oCtrl.isA("sap.ui.comp.smartfield.SmartField") &&
                                oCtrl.getId().includes(sFieldId);
                        });
                        aSmartFields.forEach((oSmartField) => {
                            oSmartField.setEditable(bIsCreate && bNowEditable);
                        });
                    }
                });

                const aSmartFields = oView.findAggregatedObjects(true, (oCtrl) => {
                    return oCtrl.isA("sap.ui.comp.smartfield.SmartField") &&
                        oCtrl.getId().includes(sFieldId);
                });
                const bEditable = bIsCreate && oUIModel.getProperty("/editable");
                aSmartFields.forEach((oSmartField) => oSmartField.setEditable(bEditable));
            },

            _calculateFormulaireId: async function () {

                var nextId = await this._callZGET_IDAction('f', '');

                return nextId.toString().padStart(10, '0');

                /*try {
                    const oModel = this.getView().getModel();
                    //const oData = oModel.getData();
                    const oData = oModel.getProperty("/");

                    const existingIds = this._extractAllFormulaireIds(oData);

                    if (existingIds.length === 0) {
                        return "0000000001";
                    }

                    const numericIds = existingIds.map(id => {
                        const num = parseInt(id.replace(/^0+/, ''), 10);
                        return isNaN(num) ? 0 : num;
                    });

                    const maxId = Math.max(...numericIds);
                    const nextId = maxId + 1;

                    return nextId.toString().padStart(10, '0');

                } catch (error) {
                    console.error("Error calculating formulaire ID:", error);
                    // Fallback to random ID but ensure 10 characters
                    return Math.random().toString(36).substr(2, 10);
                }*/
            },

            _extractAllFormulaireIds: function (data, ids = []) {
                if (Array.isArray(data)) {
                    data.forEach(item => this._extractAllFormulaireIds(item, ids));
                } else if (typeof data === 'object' && data !== null) {
                    if (data.id_formulaire && typeof data.id_formulaire === 'string') {
                        ids.push(data.id_formulaire);
                    }
                    Object.values(data).forEach(value => {
                        if (typeof value === 'object' && value !== null) {
                            this._extractAllFormulaireIds(value, ids);
                        }
                    });
                }
                return ids;
            },


            async deepUpsertSTI(data) {
                try {
                    const oModel = this.getView().getModel();
                    return new Promise((resolve, reject) => {
                        oModel.create("/ZC_STI", data, {
                            success: (oData) => {
                                console.log("Entity created:", oData);
                                resolve(oData);
                            },
                            error: (oError) => {
                                console.error("Error in deepUpsertSTI:", oError);
                                console.error("Error details:", oError.response);
                                console.error("Error message:", oError.message);

                                this._showODataErrorPopup(oError);
                                reject(oError);
                            }
                        });
                    });
                } catch (error) {
                    console.error("Unexpected error in deepUpsertSTI:", error);
                    this._showODataErrorPopup(oError);
                    throw error;
                }
            },


            onGenerateId: function () {
                return new Promise((resolve, reject) => {

                    const oContext = this._getController().getView().getBindingContext();
                    const sPath = oContext.getPath();
                    var oModel = this.getView().getModel();

                    var sBusinessNoP = oModel.getProperty(sPath + "/business_no_p");

                    if (!sBusinessNoP) {

                        var sBusinessUfo = (oModel.getProperty(sPath + "/business_p_ufo") || "").substring(0, 4);

                        var sBusinessNoE = oModel.getProperty(sPath + "/business_no_e");

                        if (!sBusinessUfo) {
                            sap.m.MessageBox.error("Le champ Business UFO est vide");
                            return;
                        }

                        if (sBusinessNoE) {
                            const prefix = sBusinessNoE.substring(0, 4);    // first 4 chars
                            const segment = sBusinessNoE.substring(4, 8);  // chars 5-8
                            const rest = sBusinessNoE.substring(8);        // chars 9-end
                            let newMiddle;

                            if (/^X{4}$/.test(segment)) {
                                // All X → replace positions 5-8 with UFO, keep rest
                                newMiddle = sBusinessUfo + rest;
                            } else {
                                // Not all X → replace positions 5-8 with UFO, but keep the next 4 chars intact
                                const next4 = sBusinessNoE.substring(4, 8); // chars 5-9
                                const remaining = sBusinessNoE.substring(12); // rest
                                newMiddle = sBusinessUfo + next4 + remaining;
                            }

                            /*const newId = prefix + newMiddle;
                            oModel.setProperty(sPath + "/business_no_p", newId);
                            resolve(newId);*/

                            const baseId = prefix + newMiddle;
                            // Calculate the next sequential ID
                            const nextId = this._calculateBusinessNoPId(baseId);
                            oModel.setProperty(sPath + "/business_no_p", nextId);
                            resolve(nextId);

                        }
                    }
                });
            },

            _calculateBusinessNoPId: function (baseId) {
                try {
                    const oModel = this.getView().getModel();
                    const oData = oModel.getProperty("/");

                    // Extract all existing business_no_p values
                    const existingIds = this._extractAllBusinessNoPIds(oData);

                    // Check if baseId already ends with a 3-digit pattern
                    const hasExistingSuffix = /-\d{3}$/.test(baseId);

                    if (hasExistingSuffix) {
                        // If baseId already has a suffix like -000, remove it to get the true base
                        baseId = baseId.replace(/-\d{3}$/, '');
                    }

                    if (existingIds.length === 0) {
                        // If no existing IDs, start with -000
                        //return baseId + "-000";
                        return baseId + "-###";
                    }

                    // Filter IDs that match the base pattern (before the last 3 digits)
                    const matchingIds = existingIds.filter(id => {
                        const idWithoutSuffix = id.replace(/-\d{3}$/, '');
                        return idWithoutSuffix === baseId;
                    });

                    if (matchingIds.length === 0) {
                        // If no matching IDs, start with -000
                        //return baseId + "-000";
                        return baseId + "-###";
                    }

                    // Extract and parse the last 3 digits (after the last hyphen)
                    const numericIds = matchingIds.map(id => {
                        const last3Digits = id.split('-').pop(); // Get the part after the last hyphen
                        const num = parseInt(last3Digits, 10);
                        return isNaN(num) ? 0 : num;
                    });

                    // Find the maximum ID and increment
                    const maxId = Math.max(...numericIds);

                    if (maxId >= 999) {
                        // Handle overflow
                        sap.m.MessageBox.warning("Maximum sequence reached (999) for this business ID");
                        //return baseId + "-999";
                        return baseId + "-###";

                    }

                    const nextId = maxId + 1;
                    return baseId + "-###" //+ nextId.toString().padStart(3, '0');

                } catch (error) {
                    console.error("Error calculating business_no_p ID:", error);
                    // Fallback to base ID with -000
                    //return baseId + "-000";
                    return baseId + "-###";
                }
            },

            _extractAllBusinessNoPIds: function (data, ids = []) {
                if (Array.isArray(data)) {
                    data.forEach(item => this._extractAllBusinessNoPIds(item, ids));
                } else if (typeof data === 'object' && data !== null) {
                    if (data.business_no_p && typeof data.business_no_p === 'string') {
                        ids.push(data.business_no_p);
                    }
                    Object.values(data).forEach(value => {
                        if (typeof value === 'object' && value !== null) {
                            this._extractAllBusinessNoPIds(value, ids);
                        }
                    });
                }
                return ids;
            },


            async getMissions() {
                function escapeODataKey(val) {
                    return String(val).replace(/'/g, "''"); // OData rule: double quotes inside keys
                }

                try {
                    const oContext = this._getController().getView().getBindingContext();
                    const oModel = this.getView().getModel();

                    if (!oContext) {
                        console.warn("Pas de bindingContext trouvé sur la vue.");
                        return [];
                    }

                    const sPathContext = oContext.getPath();
                    if (!sPathContext) {
                        console.warn("Pas de path disponible sur le bindingContext.");
                        return [];
                    }

                    const id_formulaire = escapeODataKey(oModel.getProperty(oContext.getPath() + "/id_formulaire"));
                    const business_no_e = escapeODataKey(oModel.getProperty(oContext.getPath() + "/business_no_e"));

                    //const sPath = `/ZC_STI(id_formulaire='${id_formulaire}',business_no_e='${business_no_e}')/to_Missions`;

                    const sPath = "/ZC_STI_MISSION";

                    return new Promise((resolve, reject) => {
                        oModel.read(sPath, {
                            urlParameters: {
                                //"$filter": "statutmission eq 'A'",
                                "$filter": `BusinessNo eq '${business_no_e}' and statutmission eq 'A'`,
                                "$orderby": "MissionId"
                            },
                            success: (oData) => resolve(oData?.results || []),
                            error: (oError) => reject(oError)
                        });
                    });

                } catch (error) {
                    console.error(error);
                    return [];
                }
            },

            async getBudget() {
                function escapeODataKey(val) {
                    return String(val).replace(/'/g, "''");
                }

                try {
                    const oContext = this._getController().getView().getBindingContext();
                    const oModel = this.getView().getModel();

                    const id_formulaire = escapeODataKey(oModel.getProperty(oContext.getPath() + "/id_formulaire"));
                    const business_no_e = escapeODataKey(oModel.getProperty(oContext.getPath() + "/business_no_e"));

                    const sPath = `/ZC_STI(id_formulaire='${id_formulaire}',business_no_e='${business_no_e}')/to_BUDG`;

                    return new Promise((resolve, reject) => {
                        oModel.read(sPath, {
                            success: (oData) => resolve(oData?.results || []),
                            error: (oError) => reject(oError)
                        });
                    });

                } catch (error) {
                    console.error(error);
                    return [];
                }
            },


            _showODataErrorPopup: function (oError) {
                try {
                    const oResponse = JSON.parse(oError.responseText);
                    let sErrorMessage = "An error occurred while creating the STI.";

                    if (oResponse.error && oResponse.error.innererror && oResponse.error.innererror.errordetails) {
                        const aErrors = oResponse.error.innererror.errordetails;
                        sErrorMessage = aErrors.map(function (oErrorDetail, index) {
                            return `${index + 1}. ${oErrorDetail.message}`;
                        }).join('\n\n');
                    } else if (oResponse.error && oResponse.error.message) {
                        sErrorMessage = oResponse.error.message.value || oResponse.error.message;
                    }

                    sap.m.MessageBox.error(sErrorMessage, {
                        title: "Creation Failed",
                        width: "600px",
                        details: oError.responseText,
                        styleClass: "sapUiSizeCompact"
                    });

                } catch (parseError) {
                    sap.m.MessageBox.alert("Error: " + (oError.message || "Unknown error occurred"), {
                        title: "Error"
                    });
                }
            },

            _showGenericErrorPopup: function (error) {
                sap.m.MessageBox.alert("Unexpected error: " + error.message, {
                    title: "Unexpected Error"
                });
            },

            _onPartnerCDPChanged: function (oEvent) {
                const oContext = this._getController().getView().getBindingContext();
                const sPath = oContext?.getPath();
                var oModel = this.getView().getModel();
                const oView = this.getView();

                /*if (sPath) {

                } else {
                    console.warn("Binding context or path is not available");
                }*/

                var sProfitCenter = oEvent.getParameter("value");
                if (!sProfitCenter) return;

                var oModel = this.getView().getModel();

                oModel.read("/ZC_STI_CEPC_BUKRS", {
                    filters: [new sap.ui.model.Filter("PRCTR", sap.ui.model.FilterOperator.EQ, sProfitCenter)],
                    success: function (oData) {
                        if (oData.results.length > 0) {
                            oModel.setProperty(sPath + "/business_p_cmp", oData.results[0].BUKRS);

                            //Set visibility business_p_projm

                            var sBusinessEcmp = oModel.getProperty(sPath + "/business_e_cmp");
                            var sBusinessPcmp = oModel.getProperty(sPath + "/business_p_cmp");

                            const aSmartFields = oView.findAggregatedObjects(true, (oCtrl) => {

                                return oCtrl.isA("sap.ui.comp.smartfield.SmartField") &&
                                    oCtrl.getId().includes("business_p_projm");
                            });
                            aSmartFields.forEach((oSmartField) => {

                                if (sBusinessEcmp && sBusinessPcmp && sBusinessEcmp === sBusinessPcmp) {
                                    oSmartField.setVisible(false);
                                    oModel.setProperty(sPath + "/business_p_projm", "");
                                } else {
                                    oSmartField.setVisible(true);
                                }

                            });


                        } else {
                            oModel.setProperty(sPath + "/business_p_cmp", "");
                        }
                    }.bind(this),
                    error: function (oError) {
                        sap.m.MessageToast.show("Error fetching company code");
                    }
                });
            },


            _onBusinessNoEChanged: async function (sBusinessNoE) {
                try {
                    var missions = await this.getMissions();
                    var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                    //this.getView().setModel(oMissionsModel, "missions");

                    var oMissionsModel = this.getView().getModel("missions");
                    if (oMissionsModel) {
                        oMissionsModel.setData({ results: missions });
                        oMissionsModel.refresh(true);

                        this.prepareMissionsTreeData();

                    } else {
                        oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                        this.getView().setModel(oMissionsModel, "missions");
                    }

                } catch (error) {
                    console.error("Error in business_no_e change handler:", error);
                } finally {
                    sap.ui.core.BusyIndicator.hide();
                }
            },

            prepareMissionsTreeData: function () {
                var missions = this.getView().getModel("missions").getProperty("/results");

                // Transform flat missions to hierarchical tree structure
                var treeData = this._transformMissionsToTree(missions);

                // Set the tree data to missions model
                this.getView().getModel("missions").setProperty("/", treeData);
                this.getView().getModel("missions").setProperty("/results", missions);

                // Calculate and update row count after building the tree
                var rowCount = this.countRows(treeData);
                this.updateRowCount(rowCount);

            },

            _transformMissionsToTree: function (missions) {
                const treeData = [];
                const businessNoMap = new Map();
                const regroupementMap = new Map();

                const missionStatusMap = {
                    "A": "Acquis",
                    "N": "Non Acquis",
                    "R": "Réclamé"
                };

                if (!missions) return treeData;

                // First pass: Group by BusinessNo
                missions.forEach(mission => {
                    const businessNo = mission.BusinessNo || 'Unknown Business';

                    if (!businessNoMap.has(businessNo)) {
                        const businessNode = {
                            name: businessNo,
                            BusinessNo: businessNo,
                            type: 'business',
                            info: 'Business Unit',
                            infoState: 'None',
                            children: [],
                            // Initialize totals for business node
                            totalGlobalBudget: 0,
                            totalBudgetInSTI: 0,
                            totalAvailableBudget: 0
                        };
                        businessNoMap.set(businessNo, businessNode);
                        treeData.push(businessNode);
                    }

                    const regroupement = mission.Regroupement || 'Unknown Regroupement';
                    const regroupementKey = `${businessNo}-${regroupement}`;

                    if (!regroupementMap.has(regroupementKey)) {
                        const regroupementNode = {
                            name: regroupement,
                            Regroupement: regroupement,
                            type: 'regroupement',
                            info: 'Regroupement',
                            infoState: 'None',
                            children: [],
                            // Initialize totals for regroupement node
                            totalGlobalBudget: 0,
                            totalBudgetInSTI: 0,
                            totalAvailableBudget: 0
                        };
                        regroupementMap.set(regroupementKey, regroupementNode);
                        businessNoMap.get(businessNo).children.push(regroupementNode);
                    }

                    const statusCode = mission.statutmission;
                    const statusDescription = missionStatusMap[statusCode] || statusCode;

                    // Add mission as child of regroupement
                    const missionNode = {
                        name: mission.MissionId,
                        type: 'mission',
                        info: `${mission.MissionCode} - ${mission.AvailableBudget} available`,
                        infoState: parseFloat(mission.AvailableBudget) > 0 ? 'Success' : 'Error',
                        MissionId: mission.MissionId,
                        MissionCode: mission.MissionCode,
                        GlobalBudget: mission.GlobalBudget,
                        BudgetInSTI: mission.BudgetInSTI,
                        AvailableBudget: mission.AvailableBudget,
                        SubcontractedBudgetPercentage: mission.SubcontractedBudgetPercentage,
                        BusinessNo: mission.BusinessNo,
                        Regroupement: mission.Regroupement,
                        description: mission.description,
                        statutmission: statusDescription,
                        OriginalBudgetInSTI: mission.OriginalBudgetInSTI || mission.BudgetInSTI,
                        OriginalBudget: mission.OriginalBudget
                    };

                    // Add mission values to regroupement totals
                    const regroupementNode = regroupementMap.get(regroupementKey);
                    regroupementNode.totalGlobalBudget += parseFloat(mission.GlobalBudget) || 0;
                    regroupementNode.totalBudgetInSTI += parseFloat(mission.BudgetInSTI) || 0;
                    regroupementNode.totalAvailableBudget += parseFloat(mission.AvailableBudget) || 0;

                    // Add regroupement values to business totals
                    const businessNode = businessNoMap.get(businessNo);
                    businessNode.totalGlobalBudget += parseFloat(mission.GlobalBudget) || 0;
                    businessNode.totalBudgetInSTI += parseFloat(mission.BudgetInSTI) || 0;
                    businessNode.totalAvailableBudget += parseFloat(mission.AvailableBudget) || 0;

                    regroupementNode.children.push(missionNode);
                });

                return treeData;
            },

            onRefreshTree: function () {
                this.getView().setBusy(true);

                try {
                    // Re-fetch missions and rebuild the tree
                    this.prepareMissionsTreeData();
                    sap.m.MessageToast.show("Mission tree refreshed successfully");
                } catch (error) {
                    sap.m.MessageBox.error("Error refreshing tree: " + error.message);
                } finally {
                    this.getView().setBusy(false);
                }
            },

            countRows: function (nodes) {
                if (!nodes || nodes.length === 0) return 0;

                var count = 0;
                nodes.forEach(function (node) {
                    count++;
                    if (node.children && node.children.length > 0) {
                        count += this.countRows(node.children);
                    }
                }.bind(this));

                return count;
            },

            updateRowCount: function (rowCount) {
                try {
                    var oLocalModel = this.getView().getModel("localModel");
                    if (!oLocalModel) {
                        oLocalModel = new JSONModel({
                            tableSettings: {
                                minRowCount: 10
                            }
                        });
                        this.getView().setModel(oLocalModel, "localModel");
                    }

                    var oData = oLocalModel.getData();
                    if (!oData.tableSettings) {
                        oData.tableSettings = {
                            minRowCount: 10
                        };
                        oLocalModel.setData(oData);
                    }

                    var calculatedRowCount = Math.max(rowCount, 1) + 1; // +1 for better visual appearance
                    oLocalModel.setProperty("/tableSettings/minRowCount", calculatedRowCount);

                    oLocalModel.refresh();

                } catch (error) {
                    console.error("Error updating row count:", error);
                }
            },

            _recalculateMissionBudgets: function () {
                var oView = this.getView();
                var budgetData = oView.getModel("budget").getProperty("/results");
                var missionsData = oView.getModel("missions").getProperty("/results");

                // Check if budget table is empty
                if (!budgetData || budgetData.length === 0) {
                    console.log("Budget table is empty - preserving existing mission values");
                    // Even when budget is empty, ensure OriginalBudgetInSTI is set
                    missionsData.forEach(mission => {
                        if (mission.OriginalBudgetInSTI === undefined) {
                            mission.OriginalBudgetInSTI = parseFloat(mission.BudgetInSTI || 0);
                        }
                    });
                    oView.getModel("missions").refresh(true);
                    return;
                }

                // Collect missions that exceed their available budget
                var overBudgetMissions = [];
                var updatedMissions = [];

                missionsData.forEach(mission => {
                    const missionId = mission.MissionId;

                    // Get the ORIGINAL database value (not the calculated one)
                    //const originalDatabaseBudget = parseFloat(mission.OriginalBudgetInSTI || mission.BudgetInSTI || 0);
                    const originalDatabaseBudget = parseFloat(mission.OriginalBudgetInSTI || 0);

                    // If we haven't stored the original value yet, store it now
                    /*if (!mission.OriginalBudgetInSTI) {
                        mission.OriginalBudgetInSTI = originalDatabaseBudget;
                    }*/

                    // Filter budget lines: only include NEW ones (not yet saved)
                    const newBudgetLines = budgetData.filter(b => {
                        return b.Mission_e === missionId && b.isNew;
                    });

                    // Sum of ONLY NEW manually added BudgetAlloue for this mission
                    const newManualBudget = newBudgetLines
                        .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                    // Total BudgetInSTI = original database value + ONLY NEW manual values
                    const totalBudgetInSTI = originalDatabaseBudget + newManualBudget;

                    const available = parseFloat(mission.GlobalBudget) - totalBudgetInSTI;

                    if (available < 0) {
                        overBudgetMissions.push({
                            MissionId: mission.MissionId,
                            description: mission.description,
                            available: available.toFixed(2),
                            totalBudgetInSTI: totalBudgetInSTI.toFixed(2),
                            originalDatabaseBudget: originalDatabaseBudget.toFixed(2),
                            newManualBudget: newManualBudget.toFixed(2),
                            newBudgetLinesCount: newBudgetLines.length,
                            totalBudgetLinesCount: budgetData.filter(b => b.Mission_e === missionId).length
                        });
                    } else {
                        updatedMissions.push({
                            ...mission,
                            // Preserve the original database value
                            OriginalBudgetInSTI: originalDatabaseBudget,
                            // Store the calculated total separately
                            BudgetInSTI: totalBudgetInSTI.toFixed(2),
                            AvailableBudget: available.toFixed(2),
                            SubcontractedBudgetPercentage: mission.GlobalBudget === "0.00" ?
                                "0%" : ((totalBudgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%"
                        });
                    }
                });

                if (overBudgetMissions.length > 0) {
                    var message = overBudgetMissions.map(m =>
                        `Mission '${m.description}' (${m.MissionId}) dépasse le budget disponible.\n` +
                        `Budget base: ${m.originalDatabaseBudget}, Nouveau budget manuel: ${m.newManualBudget}\n` +
                        `Budget total: ${m.totalBudgetInSTI}, Disponible: ${m.available}\n` +
                        `(Nouvelles lignes: ${m.newBudgetLinesCount}/${m.totalBudgetLinesCount})`
                    ).join("\n\n");

                    sap.m.MessageBox.warning(message, {
                        title: "Attention",
                        actions: [sap.m.MessageBox.Action.OK]
                    });
                    return;
                }

                oView.getModel("missions").setProperty("/results", updatedMissions);
                oView.getModel("missions").refresh(true);
                this.prepareMissionsTreeData();
            },


            onValidateSTI: function (oEvent) {
                this.beforeSaveExtension('INAPPROVAL');
            },

            onApproveSTI: function (oEvent) {
                this.beforeSaveExtension('APPROVE');
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


            _refreshScreenData: function (oView, status) {
                try {
                    oView.setBusy(true);

                    const oModel = oView.getModel();
                    const oContext = oView.getBindingContext();

                    if (!oContext) {
                        console.warn("No binding context available for refresh");
                        oView.setBusy(false);
                        return;
                    }

                    // Store current mission data with OriginalBudgetInSTI before refresh
                    const currentMissions = oView.getModel("missions")?.getProperty("/results") || [];
                    const missionsWithOriginalValues = currentMissions.map(mission => ({
                        ...mission,
                        // Preserve the OriginalBudgetInSTI that was calculated during initialization
                        OriginalBudgetInSTI: mission.OriginalBudgetInSTI || parseFloat(mission.BudgetInSTI || 0)
                    }));

                    // Refresh main model
                    oModel.refresh(true);

                    // Refresh budget and missions data
                    Promise.all([
                        this.getBudget(),
                        this.getMissions()
                    ]).then(([budget, missions]) => {
                        // Update budget model
                        if (oView.getModel("budget")) {
                            oView.getModel("budget").setData({ results: budget });
                        }

                        // Update missions model - preserve OriginalBudgetInSTI
                        if (oView.getModel("missions")) {
                            // Merge refreshed missions with preserved original values
                            const updatedMissions = missions.map(mission => {
                                // Find corresponding mission in preserved data
                                const preservedMission = missionsWithOriginalValues.find(m =>
                                    m.MissionId === mission.MissionId
                                );

                                return {
                                    ...mission,
                                    // Preserve the OriginalBudgetInSTI from before refresh
                                    OriginalBudgetInSTI: preservedMission ?
                                        preservedMission.OriginalBudgetInSTI :
                                        parseFloat(mission.BudgetInSTI || 0)
                                };
                            });

                            oView.getModel("missions").setData({ results: updatedMissions });
                        }

                        sap.m.MessageToast.show("Data refreshed successfully");

                        // Recalculate budgets with preserved original values
                        this._recalculateMissionBudgets();
                        this.prepareMissionsTreeData();

                        if (status !== 'DRAFT') {
                            const oRouter = sap.ui.core.UIComponent.getRouterFor(oView);
                            oRouter.navTo("ListReport");
                        }

                    }).catch(error => {
                        console.error("Error refreshing secondary data:", error);
                        sap.m.MessageToast.show("Error refreshing some data");
                    }).finally(() => {
                        oView.setBusy(false);
                    });

                } catch (error) {
                    console.error("Error in _refreshScreenData:", error);
                    oView.setBusy(false);
                }
            },
            _refreshScreenData1: function (oView, status) {
                try {
                    // Show busy indicator
                    oView.setBusy(true);

                    // Get the main model and context
                    const oModel = oView.getModel();
                    const oContext = oView.getBindingContext();

                    if (!oContext) {
                        console.warn("No binding context available for refresh");
                        oView.setBusy(false);
                        return;
                    }

                    // Refresh the main entity by re-reading it
                    const sPath = oContext.getPath();

                    // Use model's refresh method correctly
                    oModel.refresh(true); // This refreshes the entire model

                    // If you need to refresh a specific binding, use:
                    // oView.getBindingContext().getModel().refresh(true);

                    // Refresh budget and missions data
                    Promise.all([
                        this.getBudget(),
                        this.getMissions()
                    ]).then(([budget, missions]) => {
                        // Update the budget model
                        if (oView.getModel("budget")) {
                            oView.getModel("budget").setData({ results: budget });
                        }

                        // Update the missions model
                        if (oView.getModel("missions")) {
                            oView.getModel("missions").setData({ results: missions });
                        }



                        sap.m.MessageToast.show("Data refreshed successfully");

                        if (status !== 'DRAFT') {
                            const oRouter = sap.ui.core.UIComponent.getRouterFor(oView);
                            oRouter.navTo("ListReport");
                        }

                        // Recalculate budgets and refresh tree
                        this.prepareMissionsTreeData();
                        //this._recalculateMissionBudgets();

                    }).catch(error => {
                        console.error("Erreur lors du rafraîchissement des données secondaires :", error);
                        sap.m.MessageToast.show("Erreur lors du rafraîchissement de certaines données");
                    }).finally(() => {
                        oView.setBusy(false);
                    });

                } catch (error) {
                    console.error("Erreur dans _refreshScreenData :", error);
                    oView.setBusy(false);
                }
            },
        }
    }
);

