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

                },

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
                    // Calculate your formulaire ID 
                    const sNewFormulaireId = this._calculateFormulaireId();

                    // Set the value in the model
                    oModel.setProperty(sPath + "/id_formulaire", sNewFormulaireId);

                    // Set the current SAP 
                    let sUserId = "";
                    if (sap.ushell && sap.ushell.Container && sap.ushell.Container.getUser) {
                        sUserId = sap.ushell.Container.getUser().getId();
                    }
                    oModel.setProperty(sPath + "/proprio_sti", sUserId);
                }
            },

            _calculateFormulaireId: function () {

                const now = new Date();
                return "F" + now.getFullYear() +
                    (now.getMonth() + 1).toString().padStart(2, '0') +
                    now.getDate().toString().padStart(2, '0') +
                    now.getHours().toString().padStart(2, '0') +
                    now.getMinutes().toString().padStart(2, '0');
            },


        });
    }
);

