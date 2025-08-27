sap.ui.define(
    [
        "sap/ui/core/mvc/ControllerExtension",
        "sap/ui/core/mvc/OverrideExecution"
    ],
    function (
        ControllerExtension, OverrideExecution
    ) {
        "use strict";

        return ControllerExtension.extend("com.avv.ingerop.ingeropsti.ext.controller.extendOP", {

            override: {

                onInit: async function () {
                    this._getExtensionAPI().attachPageDataLoaded(this._onObjectExtMatched.bind(this));

                    this._setupEnterKeyHandlers();
                },

                beforeSaveExtension: async function () {
                    try {
                        const oView = this.base.getView();
                        const oContext = oView.getBindingContext();
                        const oModel = oContext.getModel();
                        const sPath = oContext.getPath();

                        if (!oContext) {
                            sap.m.MessageBox.error("Context Error");
                            return Promise.reject("No binding context");
                        }

                        const oPayload = oContext.getObject();

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
                            Currency: line.Currency
                        }));

                        try {
                            const updatedSTI = await this.deepUpsertSTI(oPayload);

                            if (updatedSTI) {
                                sap.m.MessageBox.show("STI created successfully: " + updatedSTI.id_formulaire, {
                                    icon: sap.m.MessageBox.Icon.SUCCESS,
                                    title: "Success",
                                    actions: [sap.m.MessageBox.Action.OK],
                                    onClose: function () {
                                        oView.getModel().refresh(true);
                                        const oRouter = sap.ui.core.UIComponent.getRouterFor(oView);
                                        oRouter.navTo("ListReport");
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
                    }
                },


            },

            _setupEnterKeyHandlers: function () {
                var oView = this.getView();

                oView.attachAfterRendering(function () {
                    oView.$().off('keypress', 'input').on('keypress', 'input', function (oEvent) {
                        if (oEvent.key === "Enter" || oEvent.keyCode === 13) {
                            oEvent.preventDefault();
                            this._onEnterKeyPressed(oEvent);
                        }
                    }.bind(this));
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

                if (!oContext) {
                    return;
                }

                const bIsCreate = this.getView().getModel("ui").getProperty("/createMode");

                if (bIsCreate) {
                    const sNewFormulaireId = this._calculateFormulaireId();

                    oModel.setProperty(sPath + "/id_formulaire", sNewFormulaireId);

                    let sUserId = "";
                    if (sap.ushell && sap.ushell.Container && sap.ushell.Container.getUser) {
                        sUserId = sap.ushell.Container.getUser().getId();
                    }
                    oModel.setProperty(sPath + "/proprio_sti", sUserId);
                }



                var missions = await this.getMissions();
                var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                this.getView().setModel(oMissionsModel, "missions");

                var budget = await this.getBudget();
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
                this.getView().getModel("budget").attachPropertyChange(() => {
                    var budgetData = this.getView().getModel("budget").getProperty("/results");
                    var missionsData = this.getView().getModel("missions").getProperty("/results");

                    missionsData.forEach(mission => {
                        const missionId = mission.MissionId;

                        const budgetInSTI = budgetData
                            .filter(b => b.Mission_e === missionId)
                            .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                        // BudgetInSTI
                        mission.BudgetInSTI = budgetInSTI.toFixed(2);

                        // GlobalBudget = 100
                        mission.GlobalBudget = 100;

                        // AvailableBudget = GlobalBudget - BudgetInSTI
                        mission.AvailableBudget = (mission.GlobalBudget - budgetInSTI).toFixed(2);

                        // SubcontractedBudgetPercentage = BudgetInSTI / GlobalBudget * 100
                        mission.SubcontractedBudgetPercentage = ((budgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%";


                    });

                    this.getView().getModel("missions").refresh();

                });

                // --- Initial calculation to display the values immediately ---
                missions.forEach(mission => {
                    const missionId = mission.MissionId;

                    // Sum of BudgetAlloue for this mission
                    const budgetInSTI = budget
                        .filter(b => b.Mission_e === missionId)
                        .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0);

                    mission.BudgetInSTI = budgetInSTI.toFixed(2);
                    mission.GlobalBudget = 100;
                    mission.AvailableBudget = (mission.GlobalBudget - budgetInSTI).toFixed(2);
                    mission.SubcontractedBudgetPercentage = ((budgetInSTI / mission.GlobalBudget) * 100).toFixed(2) + "%";
                });

                var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                this.getView().setModel(oMissionsModel, "missions");


                //attach event
                if (oContext) {
                    const oBinding = oContext.getModel().bindProperty(oContext.getPath() + "/business_no_e");

                    oBinding.attachChange((oEvent) => {
                        const sNewValue = oEvent.getSource().getValue();
                        this._onBusinessNoEChanged({ getParameter: () => sNewValue });
                    });
                }

                // Make fields only in create mode
                this._setFieldEditableState("business_no_e", bIsCreate);
                this._setFieldEditableState("business_no_p_t", bIsCreate);
                this._setFieldEditableState("business_p_cmp", bIsCreate);
                this._setFieldEditableState("business_p_ufo", bIsCreate);
                this._setFieldEditableState("business_p_cdp", bIsCreate);
                this._setFieldEditableState("business_p_bm", bIsCreate);
                this._setFieldEditableState("business_p_mail", bIsCreate);

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

            _calculateFormulaireId: function () {
                try {
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
                }
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

                    var sBusinessUfo = oModel.getProperty(sPath + "/business_p_ufo");

                    if (!sBusinessUfo) {
                        sap.m.MessageBox.error("Business UFO field is empty");
                        return;
                    }

                    var mParams = {
                        IV_PROJECT_TYPE: "PO",
                        IV_UFO: sBusinessUfo
                    };

                    oModel.callFunction("/ZGENERATE_IDS", {
                        method: "POST",
                        urlParameters: mParams,

                        success: function (oData) {
                            var sGeneratedId = oData.ZGENERATE_IDS.Id;
                            oModel.setProperty(sPath + "/business_no_p", sGeneratedId);
                            resolve(sGeneratedId);
                        },
                        error: function (oError) {
                            sap.m.MessageBox.error("Error: " + oError.message);
                            reject(oError);
                        }

                    });

                });
            },

            async getMissions() {
                function escapeODataKey(val) {
                    return String(val).replace(/'/g, "''"); // OData rule: double quotes inside keys
                }

                try {
                    const oContext = this._getController().getView().getBindingContext();
                    const oModel = this.getView().getModel();

                    const id_formulaire = escapeODataKey(oModel.getProperty(oContext.getPath() + "/id_formulaire"));
                    const business_no_e = escapeODataKey(oModel.getProperty(oContext.getPath() + "/business_no_e"));

                    const sPath = `/ZC_STI(id_formulaire='${id_formulaire}',business_no_e='${business_no_e}')/to_Missions`;

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

            _onBusinessNoEChanged: async function (sBusinessNoE) {
                try {
                    var missions = await this.getMissions();
                    var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                    //this.getView().setModel(oMissionsModel, "missions");

                    var oMissionsModel = this.getView().getModel("missions");
                    if (oMissionsModel) {
                        oMissionsModel.setData({ results: missions });
                        oMissionsModel.refresh(true);
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


        });
    }
);

