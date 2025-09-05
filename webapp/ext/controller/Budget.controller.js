sap.ui.define(['sap/ui/core/mvc/Controller'], function (Controller) {
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

        onAddBudgetLine1: function (oEvent) {
            const oView = this.getView();
            const oContext = oView.getBindingContext();
            const sModel = oContext.getModel();
            const sPath = oContext.getPath();

            var business_no_p = sModel.getProperty(sPath + "/business_no_p");

            this.onMissionChange(oEvent);

            var oBudgetModel = this.getView().getModel("budget");
            var aMissions = this.getView().getModel("missions").getProperty("/results");

            if (!oBudgetModel.getProperty("/Mission_e") && aMissions.length > 0) {
                oBudgetModel.setProperty("/Mission_e", aMissions[0].MissionId);
                var sMission_e = aMissions[0].MissionId;
            }

            var oModel = this.getView().getModel("budget");
            var aData = oModel.getProperty("/results") || [];

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

            var oNewLine = {
                Mission_e: sMission_e,
                Mission_p: newMissionP,
                StartDate: '',
                EndDate: '',
                business_no_p: business_no_p,
                BudgetAlloue: '0',
                Currency: 'EUR'
            };

            aData.push(oNewLine);
            oModel.setProperty("/results", aData);
        },

        onAddBudgetLine: function (oEvent) {
            const oView = this.getView();
            const oContext = oView.getBindingContext();
            const sModel = oContext.getModel();
            const sPath = oContext.getPath();

            var business_no_p = sModel.getProperty(sPath + "/business_no_p");

            var oBudgetModel = this.getView().getModel("budget");
            var aMissions = this.getView().getModel("missions").getProperty("/results");

            // Get default mission if available
            var sMission_e = "";
            if (aMissions.length > 0) {
                sMission_e = aMissions[0].MissionId;
            }

            var oModel = this.getView().getModel("budget");
            var aData = oModel.getProperty("/results") || [];

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

            var oNewLine = {
                Mission_e: sMission_e,
                Mission_p: newMissionP,
                StartDate: '',
                EndDate: '',
                business_no_p: business_no_p,
                BudgetAlloue: '0',
                Currency: 'EUR',
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

            if (oBindingContext) {
                oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/Mission_e", sSelectedKey);
            }
        },

        isLineEditable: function(bIsNew) {
            return bIsNew === true;
        },

        enableAddLine: function (bEditable, aMissions) {
            return bEditable && Array.isArray(aMissions) && aMissions.length > 0;
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
        },

        onMissionChange1: function (oEvent) {
            var oSelect = oEvent.getSource();

            var oRow = oSelect.getParent();

            var oBindingContext = oRow.getBindingContext("budget");

            var oSelectedItem = oEvent.getParameter("selectedItem");
            var sSelectedKey = oSelectedItem ? oSelectedItem.getKey() : null;

            if (oBindingContext) {
                oBindingContext.getModel().setProperty(oBindingContext.getPath() + "/Mission_e", sSelectedKey);
            }

            console.log("Selected Mission Key:", sSelectedKey);
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

        enableAddLine: function (bEditable, aMissions) {
            return bEditable && Array.isArray(aMissions) && aMissions.length > 0;
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
        }



    });
});
