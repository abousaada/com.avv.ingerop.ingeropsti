sap.ui.define(
    [
        "sap/ui/core/mvc/ControllerExtension"
    ],
    function (
        ControllerExtension,
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

                        if (!oContext) {
                            sap.m.MessageBox.error("Context Error");
                            return Promise.reject("No binding context");
                        }

                        const oPayload = oContext.getObject();

                        try {
                            const updatedFGA = await this.deepUpsertSTI(oPayload);

                            if (updatedFGA) {
                                sap.m.MessageToast.show("STI created: " + updatedFGA.IdFormulaire);
                            }

                        } catch (error) {
                            //Helper.errorMessage("STI update fail");
                            console.error(error);
                            return Promise.reject(error);
                        }

                        return Promise.reject();

                    } catch (error) {
                        //Helper.errorMessage("STI update fail");
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

                //this.onGenerateId();

            },

            _calculateFormulaireId: function () {

                return Math.random().toString(36).substr(2, 10);

            },

            async deepUpsertSTI(data) {
                try {


                    data.to_BUDG = [
                        {
                            BUSINESS_NO_E: data.business_no_e || "TEST005",
                            IdFormulaire: data.id_formulaire || "FORM002",
                            Mission: "MISSION_001",
                            BusinessNoP: "PARTNER001"
                        }
                    ];

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
                                reject(oError);
                            }
                        });
                    });
                } catch (error) {
                    console.error("Unexpected error in deepUpsertSTI:", error);
                    throw error;
                }
            },

            onGenerateId: function () {
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

                        sap.m.MessageToast.show("Generated ID: " + sGeneratedId);
                    },
                    error: function (oError) {
                        sap.m.MessageBox.error("Error: " + oError.message);
                    }
                });
            },

            onSubmit: function (oEvent) {
                if (oEvent.getParameter("enterPressed")) {
                    this.callGenerateIdsAction();
                }
            },



        });
    }
);

