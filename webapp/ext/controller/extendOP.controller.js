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
                await this._setupEnterKeyHandlers();

                sap.ui.getCore().getEventBus().subscribe("budget", "budgetLineDeleted", this._recalculateMissionBudgets, this);

            },

            _onBeforeEdit: function () {
                return new Promise((resolve, reject) => {

                    const oDialog = new Dialog({
                        title: "Confirmation",
                        content: new Text({
                            text: "Do you want to edit this document?"
                        }),
                        beginButton: new Button({
                            text: "Yes",
                            press: function () {
                                oDialog.close();
                                resolve(); // ✅ continue Edit
                            }
                        }),
                        endButton: new Button({
                            text: "No",
                            press: function () {
                                oDialog.close();
                                reject(); // 
                            }
                        }),
                        afterClose: function () {
                            oDialog.destroy();
                        }
                    });

                    oDialog.open();
                });
            },

            beforeSaveExtension: async function (status) {

                const that = this;
                //const oView = this.base.getView();
                const oView = this.getView();
                const oContext = oView.getBindingContext();
                const oModel = oContext.getModel();
                const sPath = oContext.getPath();

                try {

                    oView.setBusy(true);

                    if (!oContext) {
                        sap.m.MessageBox.error("Context Error");
                        return Promise.reject("No binding context");
                    }

                    const oPayload = oContext.getObject();

                    //const nextId = await this._callZGET_IDAction();

                    var business_no_p = oModel.getProperty(sPath + "/business_no_p");

                    // VALIDATION CHECKS: before generating ID or saving :InterCo/CDP check
                    const sBusinessNoE = oModel.getProperty(sPath + "/business_no_e");
                    const sBusinessUfo = (oModel.getProperty(sPath + "/business_p_ufo") || "").substring(0, 4);
                    const sBusinessCdp = oModel.getProperty(sPath + "/business_p_cdp");

                    if (business_no_p === undefined && status !== 'INAPPROVAL' && status !== 'APPROVE') {

                        // Validate InterCo check
                        const isInterCo = await this._callZCHECK_INTERCOAction(sBusinessNoE, sBusinessUfo);
                        if (isInterCo) {
                            sap.m.MessageBox.error("Une STI Groupe vers cette UFO déléguée existe déjà pour cette affaire. Un second flux n’est pas autorisé.");
                            oView.setBusy(false);
                            return Promise.reject("InterCo validation failed");
                        }

                        // Validate CDP check
                        const isInterCdp = await this._callZCHECK_UFO_CDPAction(sBusinessNoE, sBusinessCdp);
                        if (isInterCdp) {
                            sap.m.MessageBox.error("Une STI avec la même affaire émettrice et le même centre de profit récepteur existe déjà. La création d’un doublon n’est pas autorisée.");
                            oView.setBusy(false);
                            return Promise.reject("InterCdp validation failed");
                        }
                    }

                    var business_no_p = oModel.getProperty(sPath + "/business_no_p");
                    if (!business_no_p) {
                        await this.onGenerateId();
                        business_no_p = oModel.getProperty(sPath + "/business_no_p");
                        oPayload.business_no_p = business_no_p;
                    }

                    if (status === 'APPROVED' || oPayload.is_avenant === 'X') {
                        oPayload.is_avenant = 'X';
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
                        CreationDate: line.CreationDate,
                        //statutmission: line.statutmission || 'A' 
                    }));


                    // ====== Filter only NEW modifBudget lines ======
                    const aAllBudgetModifications = oView.getModel("modifBudget").getProperty("/results") || [];

                    // Filter to get only new lines
                    const aNewBudgetModifications = aAllBudgetModifications.filter(modif => modif.isNew === true);
                    const aModificationsPayload = [];
                    if (aAllBudgetModifications.length > 0) {
                        aAllBudgetModifications.forEach((modif, index) => {
                            const oModification = {
                                BUSINESS_NO_E: oPayload.business_no_e || '',
                                IdFormulaire: oPayload.id_formulaire || '',
                                DateCreation: modif.DateCreation || new Date(),
                                Mission_e: modif.Mission_e || '',
                                Mission_p: modif.Mission_p || '',
                                DeltaBudget: modif.DeltaBudget || '0',
                                Devise: modif.Devise,
                                modif_sec: modif.modif_sec
                            };

                            aModificationsPayload.push(oModification);
                        });

                        console.log("Payload des modifications préparé:", aModificationsPayload);
                    };

                    if (aModificationsPayload.length > 0) {
                        oPayload.to_MODIF_BUDG = aModificationsPayload;
                    };

                    if (!status) {
                        status = 'DRAFT';
                    }
                    oPayload.status = status;

                    try {
                        const updatedSTI = await this.deepUpsertSTI(oPayload);

                        if (updatedSTI) {

                            var message;

                            if (status === 'DRAFT') {
                                message = "Le formulaire créé avec succès ";
                            } else {
                                message = "Le formulaire a été envoyé pour validation ";
                            }

                            sap.m.MessageBox.show(message + updatedSTI.id_formulaire, {
                                icon: sap.m.MessageBox.Icon.SUCCESS,
                                title: "Success",
                                actions: [sap.m.MessageBox.Action.OK],
                                onClose: function () {
                                    that._recalculateMissionBudgets();

                                    const newIdFormulaire = updatedSTI.id_formulaire;
                                    oModel.setProperty(sPath + "/id_formulaire", newIdFormulaire);

                                    oView.getModel().refresh(true);
                                    const oUIModel = oView.getModel("ui");
                                    if (oUIModel) {
                                        oUIModel.setProperty("/editable", false);
                                    }

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

            _setupEnterKeyHandlers: async function () {
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

            _onEnterKeyPressed: async function (oEvent) {
                const bIsCreate = this.getView().getModel("ui").getProperty("/createMode");
                if (bIsCreate) { await this.onGenerateId() };
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

                // Editable if status is 'DRAFT' or empty/null
                const bCanEdit = !sStatus || sStatus === "DRAFT"
                    || sStatus === "En cours" || sStatus === "APPROVED";

                let oUIModel = oView.getModel("ui");
                if (!oUIModel) {
                    oUIModel = new sap.ui.model.json.JSONModel({
                        editable: false,
                        enabled: bCanEdit
                    });
                    oView.setModel(oUIModel, "ui");
                } else {
                    //oUIModel.setProperty("/editable", false);
                    oUIModel.setProperty("/enabled", bCanEdit);
                }

                if (sStatus === 'DRAFT') {
                    oModel.setProperty(sPath + "/status", 'En cours');
                }

                if (sStatus === "APPROVED") {
                    this._showApprovedRowPopup();
                }

                const bIsCreate = this.getView().getModel("ui").getProperty("/createMode");

                this._controlButtonVisibility(bIsCreate);

                if (bIsCreate) {
                    var sNewFormulaireId; // = await this._calculateFormulaireId();

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
                var modifBudget = await this.getModifBudget();
                var wf = await this.getWF();
                var comments = await this.getComments();
                var oGrouped = this._groupCommentLines(comments);
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

                var oModifBudgetModel = new sap.ui.model.json.JSONModel({ results: modifBudget });
                this.getView().setModel(oModifBudgetModel, "modifBudget");

                var oWfModel = new sap.ui.model.json.JSONModel({ results: wf });
                this.getView().setModel(oWfModel, "wf");

                var oCommentsModel = new sap.ui.model.json.JSONModel({ results: comments });
                this.getView().setModel(oCommentsModel, "comments");
                oCommentsModel.setData(oGrouped);
                var oCurrencyModel = new sap.ui.model.json.JSONModel({
                    Currencies: [
                        { key: "EUR", text: "Euro" },
                        { key: "USD", text: "US Dollar" },
                        { key: "GBP", text: "British Pound" }
                    ]
                });
                this.getView().setModel(oCurrencyModel, "currencies");

                var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                this.getView().setModel(oMissionsModel, "missions");
                //WF status

                // var oMissionsModel = new sap.ui.model.json.JSONModel({ results: missions });
                // this.getView().setModel(oMissionsModel, "missions");

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

                const bIsAvnant = this.isAvnant(oModel, sPath);
                this._setAvenantFieldEditableState("stidescr", bIsAvnant);

                const bIsModif = this.isModif(oModel, sPath);

                this.prepareMissionsTreeData();


            },

            _showApprovedRowPopup: function () {
                const that = this;

                const oView = this.getView();
                const oUIModel = oView.getModel("ui");
                const oContext = oView.getBindingContext();
                const oModel = oContext.getModel();
                const sPath = oContext.getPath();

                const sIsAvenant = oModel.getProperty(sPath + "/is_avenant");
                const sIsModif = oModel.getProperty(sPath + "/is_modif");

                // Créer la popup de choix
                const oDialog = new sap.m.Dialog({
                    title: "Action sur document approuvé",
                    type: sap.m.DialogType.Message,
                    content: new sap.m.VBox({
                        items: [
                            new sap.m.Text({
                                text: "Ce document a le statut 'Approuvé'. Que souhaitez-vous faire ?"
                            })
                        ]
                    }),
                    initialFocus: "cancelButton", // Focus sur Annuler par défaut
                    buttons: [
                        new sap.m.Button({
                            text: "Créer un avenant",
                            press: function () {
                                oDialog.close();
                                that._createAmendment();
                            }
                        }),
                        new sap.m.Button({
                            text: "Modifier le budget",
                            press: function () {
                                oDialog.close();
                                that._modifyBudget();
                            }
                        }),
                        new sap.m.Button({
                            id: "cancelButton", // ID pour le focus initial
                            text: "Consulter",
                            type: sap.m.ButtonType.Emphasized, // Bouton emphasized
                            press: function () {
                                oDialog.close();
                                // Ne rien faire, juste fermer la popup
                                sap.m.MessageToast.show("Action annulée");

                                // Disable editing when cancel is clicked
                                const oView = that.getView();
                                const oUIModel = oView.getModel("ui");
                                if (oUIModel) {
                                    oUIModel.setProperty("/editable", false);
                                    oUIModel.setProperty("/enabled", false);
                                    oUIModel.setProperty("/showAddAmendment", sIsAvenant);
                                    oUIModel.setProperty("/showModifBudget", sIsModif);
                                    oUIModel.refresh(true);
                                }
                            }
                        })
                    ],
                    afterClose: function () {
                        oDialog.destroy();
                    }
                });

                oDialog.open();
            },

            _modifyBudget: function () {
                const oView = this.getView();
                const oUIModel = oView.getModel("ui");
                const oContext = oView.getBindingContext();

                if (oContext) {
                    const oModel = oContext.getModel();
                    const sPath = oContext.getPath();

                    // Set is_avenant to 'X' in the main model
                    if (oModel && sPath) {
                        oModel.setProperty(sPath + "/is_modif", "X");
                        oModel.setProperty(sPath + "/is_avenant", "");
                        console.log("is_avenant set to X in modify budget mode");
                    }
                }


                // Définir le mode "modification budget seulement"
                if (oUIModel) {
                    oUIModel.setProperty("/showAddAmendment", false);
                    oUIModel.setProperty("/showModifBudget", true); // Afficher le tableau modification budget
                    oUIModel.refresh(true);
                }


                // Désactiver le bouton "Add Line" pour le tableau budget principal
                sap.m.MessageToast.show("Mode modification budget activé - L'ajout de lignes est désactivé");
            },


            _createAmendment: function () {
                const oView = this.getView();
                const oUIModel = oView.getModel("ui");
                const oContext = oView.getBindingContext();

                if (oContext) {
                    const oModel = oContext.getModel();
                    const sPath = oContext.getPath();

                    // Set is_avenant to 'X' in the main model
                    if (oModel && sPath) {
                        oModel.setProperty(sPath + "/is_avenant", "X");
                        oModel.setProperty(sPath + "/is_modif", "");
                        console.log("is_avenant set to X in modify budget mode");
                    }
                }

                if (oUIModel) {
                    // Pour un avenant, activer l'ajout de lignes
                    oUIModel.setProperty("/showAddAmendment", true);
                    oUIModel.setProperty("/showModifBudget", false); // Cacher le tableau modification budget
                }

                sap.m.MessageToast.show("Vous pouvez ajouter de nouvelles lignes budgétaires.");
            },

            isModif: function (oModel, sPath) {
                if (!oModel || !sPath) {
                    return false;
                }

                const sStatus = oModel.getProperty(sPath + "/status");
                const sIsModif = oModel.getProperty(sPath + "/is_modif");

                // Define your logic for when is_modif should be considered true
                const bIsModif = sStatus === "APPROVED" ||
                    (sStatus === "DRAFT" && sIsModif === "X") ||
                    (sStatus === "En cours" && sIsModif === "X") ||
                    sIsModif === "X"; // Or any other conditions you need

                // Store in UI model for other controllers to access
                const oView = this.getView();
                let oUIModel = oView.getModel("ui");
                if (!oUIModel) {
                    oUIModel = new sap.ui.model.json.JSONModel({
                        isModif: sIsModif,
                        editable: false,
                        enabled: true,
                        showAddAmendment: false,
                        showModifBudget: true
                    });
                    oView.setModel(oUIModel, "ui");
                } else {
                    oUIModel.setProperty("/showModifBudget", bIsModif);
                    oUIModel.setProperty("/isModif", bIsModif);
                }


                return bIsModif;
            },

            isAvnant: function (oModel, sPath) {
                if (!oModel || !sPath) {
                    return false;
                }

                const sStatus = oModel.getProperty(sPath + "/status");
                const sIsAvenant = oModel.getProperty(sPath + "/is_avenant");

                const bIsAvnant = sStatus === "APPROVED" ||
                    (sStatus === "DRAFT" && sIsAvenant === "X") ||
                    (sStatus === "En cours" && sIsAvenant === "X");

                // Store in UI model for other controllers to access
                const oView = this.getView();
                let oUIModel = oView.getModel("ui");
                if (!oUIModel) {
                    oUIModel = new sap.ui.model.json.JSONModel({
                        isAvnant: sIsAvenant,
                        editable: false,
                        enabled: true
                    });
                    oView.setModel(oUIModel, "ui");
                } else {
                    oUIModel.setProperty("/isAvnant", bIsAvnant);
                }

                return bIsAvnant;
            },

            _controlButtonVisibility: function (bIsCreate) {
                try {
                    // Get the Fiori elements controller
                    const oController = this._getController();
                    if (!oController) return;

                    // Get the Object Page layout
                    const oObjectPage = oController.byId("objectPage");
                    if (!oObjectPage) return;

                    // Control both buttons
                    const aButtons = [
                        { id: "btnValidateButton", text: "Approuver" },   // btnApprove from manifest
                        { id: "btnApproveButton", text: "Valider" }       // btnValidate from manifest
                    ];

                    aButtons.forEach(oButtonDef => {
                        let oButton = null;

                        oButton = oController.byId(oButtonDef.id);

                        if (!oButton) {
                            const oHeader = oObjectPage.getHeaderTitle();
                            if (oHeader && oHeader.getActions) {
                                const aActions = oHeader.getActions();
                                oButton = aActions.find(action =>
                                    action.getId().includes(oButtonDef.id) ||
                                    action.getText() === oButtonDef.text
                                );
                            }
                        }
                        if (!oButton) {
                            const aFoundButtons = this.getView().findAggregatedObjects(true,
                                (oCtrl) => oCtrl.isA("sap.m.Button") &&
                                    (oCtrl.getId().includes(oButtonDef.id) ||
                                        oCtrl.getText() === oButtonDef.text)
                            );
                            if (aFoundButtons.length > 0) {
                                oButton = aFoundButtons[0];
                            }
                        }

                        // Set visibility for found button
                        if (oButton) {
                            oButton.setVisible(!bIsCreate);
                            if (bIsCreate) {
                                oButton.setEnabled(false);
                            }
                        }
                    });

                } catch (error) {
                    console.error("Error controlling button visibility:", error);
                }
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


            _setAvenantFieldEditableState: function (sFieldId, bIsAvnant) {
                const oView = this.getView();

                const aSmartFields = oView.findAggregatedObjects(true, (oCtrl) => {
                    return oCtrl.isA("sap.ui.comp.smartfield.SmartField") &&
                        oCtrl.getId().includes(sFieldId);
                });

                // stidescr should be editable when NOT an avenant
                const bShouldBeEditable = !bIsAvnant;

                aSmartFields.forEach((oSmartField) => {
                    oSmartField.setEditable(bShouldBeEditable);
                });
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
            _splitTextToLines: function (sText, sType) {
                const MAX_LENGTH = 255;
                const aLines = [];

                if (!sText) return aLines;

                for (let i = 0; i < sText.length; i += MAX_LENGTH) {
                    const line = sText.substring(i, i + MAX_LENGTH);
                    aLines.push({
                        CommentType: sType,                       // ex: "COMM1"
                        line: String(aLines.length + 1).padStart(3, "0"), // 001, 002, ...
                        text_line: line
                    });
                }

                return aLines;
            },

            async deepUpsertSTI(data) {
                //Comments
                const sComm1 = this.getView().byId("txtComment1").getValue();
                const sComm2 = this.getView().byId("txtComment2").getValue();
                const sComm3 = this.getView().byId("txtComment3").getValue();
                const sComm4 = this.getView().byId("txtComment4").getValue();
                const sComm5 = this.getView().byId("txtComment5").getValue();

                // Découper chaque texte
                const aComm1 = this._splitTextToLines(sComm1, "COMM1");
                const aComm2 = this._splitTextToLines(sComm2, "COMM2");
                const aComm3 = this._splitTextToLines(sComm3, "COMM3");
                const aComm4 = this._splitTextToLines(sComm4, "COMM4");
                const aComm5 = this._splitTextToLines(sComm5, "COMM5");
                // Affecter les propriétés à chaque ligne de chaque tableau
                [aComm1, aComm2, aComm3, aComm4, aComm5].forEach(aComments => {
                    aComments.forEach(line => {
                        line.id_formulaire = data.id_formulaire;
                        line.BusinessNo = data.business_no_e;
                    });
                });
                //  Ajout du bloc de commentaires
                const aAllComments = [].concat(aComm1, aComm2, aComm3, aComm4, aComm5);
                data.to_Comments = aAllComments;
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

            onGenerateId: async function () {

                const oContext = this._getController().getView().getBindingContext();
                const sPath = oContext.getPath();
                const oModel = this.getView().getModel();

                const sBusinessUfo = (oModel.getProperty(sPath + "/business_p_ufo") || "").substring(0, 4);
                const sBusinessCdp = oModel.getProperty(sPath + "/business_p_cdp");
                const sBusinessNoE = oModel.getProperty(sPath + "/business_no_e");
                const sBusinessNoP = oModel.getProperty(sPath + "/business_no_p");

                if (!sBusinessUfo) {
                    sap.m.MessageBox.error("Le champ Business UFO est vide");
                    return;
                }

                const isInterCo = await this._callZCHECK_INTERCOAction(sBusinessNoE, sBusinessUfo);
                if (isInterCo && !sBusinessNoP) {
                    sap.m.MessageBox.error("Une STI Groupe vers cette UFO déléguée existe déjà pour cette affaire. Un second flux n’est pas autorisé.");
                    return;
                }

                const isInterCdp = await this._callZCHECK_UFO_CDPAction(sBusinessNoE, sBusinessCdp);
                if (isInterCdp && !sBusinessNoP) {
                    sap.m.MessageBox.error("Une STI avec la même affaire émettrice et le même centre de profit récepteur existe déjà. La création d’un doublon n’est pas autorisée.");
                    return;
                }

                // ---- Generate ID logic ----
                const prefix = sBusinessNoE.substring(0, 4);
                const segment = sBusinessNoE.substring(4, 8);
                const rest = sBusinessNoE.substring(8);

                let newMiddle;
                if (/^X{4}$/.test(segment)) {
                    newMiddle = sBusinessUfo + rest;
                } else {
                    const next4 = sBusinessNoE.substring(4, 8);
                    const remaining = sBusinessNoE.substring(12);
                    //newMiddle = sBusinessUfo + next4 + remaining;
                    newMiddle = next4 + sBusinessUfo + remaining;
                }

                const baseId = prefix + newMiddle;
                const nextId = this._calculateBusinessNoPId(baseId);

                oModel.setProperty(sPath + "/business_no_p", nextId);

                return nextId;
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


            _groupCommentLines: function (aLines) {
                const oGrouped = { COMM1: "", COMM2: "", COMM3: "", COMM4: "", COMM5: "" };

                if (!Array.isArray(aLines)) { return oGrouped; }

                // ordre correct : par type puis par numéro de ligne
                aLines.sort((a, b) => {
                    if (a.CommentType === b.CommentType) {
                        return parseInt(a.LineNo, 10) - parseInt(b.LineNo, 10);
                    }
                    return (a.CommentType || "").localeCompare(b.CommentType || "");
                });

                aLines.forEach(line => {
                    const sType = line.CommentType;
                    if (oGrouped.hasOwnProperty(sType)) {
                        oGrouped[sType] += (line.text_line || "");
                    }
                });

                // optionnel: trim
                Object.keys(oGrouped).forEach(k => oGrouped[k] = oGrouped[k].trim());

                return oGrouped;
            },
            async getComments() {
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

                    const sPath = `/ZC_STI(id_formulaire='${id_formulaire}',business_no_e='${business_no_e}')/to_Comments`;

                    // const sPath = "/ZI_STI_COMMENTS";

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

            async getModifBudget() {
                function escapeODataKey(val) {
                    return String(val).replace(/'/g, "''");
                }

                try {
                    const oContext = this._getController().getView().getBindingContext();
                    const oModel = this.getView().getModel();

                    const id_formulaire = escapeODataKey(oModel.getProperty(oContext.getPath() + "/id_formulaire"));
                    const business_no_e = escapeODataKey(oModel.getProperty(oContext.getPath() + "/business_no_e"));

                    const sPath = `/ZC_STI(id_formulaire='${id_formulaire}',business_no_e='${business_no_e}')/to_MODIF_BUDG`;

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

            //WF status
            async getWF() {
                function escapeODataKey(val) {
                    return String(val).replace(/'/g, "''");
                }

                try {
                    const oContext = this._getController().getView().getBindingContext();
                    const oModel = this.getView().getModel();

                    const id_formulaire = escapeODataKey(oModel.getProperty(oContext.getPath() + "/id_formulaire"));
                    const business_no_e = escapeODataKey(oModel.getProperty(oContext.getPath() + "/business_no_e"));

                    const sPath = `/ZC_STI(id_formulaire='${id_formulaire}',business_no_e='${business_no_e}')/to_WF`;

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

                        this._recalculateMissionBudgets();
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


            resetOriginalMissionsModel: function () {
                var oView = this.getView();
                var missionsModel = oView.getModel("missions");
                var missionsData = missionsModel.getProperty("/results") || [];

                this._originalMissionsModel = {
                    data: JSON.parse(JSON.stringify(missionsData)),
                    lastUpdated: new Date().getTime()
                };
            },

            _recalculateMissionBudgets: function () {
                var oView = this.getView();
                var budgetData = oView.getModel("budget").getProperty("/results");
                var modifBudgetData = oView.getModel("modifBudget").getProperty("/results") || [];

                // Get the missions model from the view
                var missionsModel = oView.getModel("missions");

                // Get missions data
                var missionsData = missionsModel.getProperty("/results") || [];

                // Flag to avoid multiple alerts
                if (!this._lastBudgetAlertTime) {
                    this._lastBudgetAlertTime = 0;
                }
                var now = new Date().getTime();
                var showAlert = (now - this._lastBudgetAlertTime) > 5000; // 5 seconds between alerts

                var overBudgetMissions = [];
                var updatedMissions = [];

                // Group modifBudget data by mission for easier calculation
                var modifBudgetByMission = {};
                modifBudgetData.forEach(modif => {
                    var missionId = modif.Mission_e; // Receiver mission
                    var delta = parseFloat(modif.DeltaBudget || 0);

                    if (!modifBudgetByMission[missionId]) {
                        modifBudgetByMission[missionId] = 0;
                    }
                    modifBudgetByMission[missionId] += delta;
                });

                missionsData.forEach(mission => {
                    const missionId = mission.MissionId;

                    // Get the ORIGINAL database BudgetInSTI value (from initial load)
                    // This should only include values from saved database records
                    const originalDatabaseBudgetInSTI = parseFloat(mission.OriginalBudgetInSTI || mission.BudgetInSTI || 0);

                    // Calculate budget from table:
                    // 1. NEW lines (isNew === true)
                    // 2. MODIFIED existing lines (ID contains ## or ###)
                    const tableBudgetLines = budgetData && budgetData.length > 0 ?
                        budgetData.filter(b => b.Mission_e === missionId) : [];

                    let tableBudgetTotal = 0;
                    let modifiedExistingBudget = 0;
                    let newBudgetLines = 0;

                    tableBudgetLines.forEach(b => {
                        const budgetValue = parseFloat(b.BudgetAlloue || 0);

                        // Check if this is a new line
                        if (b.isNew === true) {
                            newBudgetLines += budgetValue;
                            tableBudgetTotal += budgetValue;
                        }
                        // Check if this is a modified existing line (contains ## or ### in ID)
                        else if (b.Mission_p && (b.Mission_p.includes('##') || b.Mission_p.includes('###'))) {
                            modifiedExistingBudget += budgetValue;
                            tableBudgetTotal += budgetValue;
                        }
                        // For other existing lines, they should already be in originalDatabaseBudgetInSTI
                        // so we don't add them again to avoid double counting
                    });

                    // Sum budget modifications for this mission
                    const budgetModifications = modifBudgetByMission[missionId] || 0;

                    // TOTAL BudgetInSTI = Original Database value + Table budget (new/modified) + Budget modifications
                    const totalBudgetForMission = originalDatabaseBudgetInSTI + tableBudgetTotal + budgetModifications;

                    const available = parseFloat(mission.GlobalBudget || 0) - totalBudgetForMission;

                    const updatedMission = {
                        ...mission,
                        OriginalBudgetInSTI: originalDatabaseBudgetInSTI, // Preserve the original database value
                        BudgetInSTI: totalBudgetForMission.toFixed(2),
                        AvailableBudget: available.toFixed(2),
                        SubcontractedBudgetPercentage: parseFloat(mission.GlobalBudget || 0) === 0 ?
                            "0%" : ((totalBudgetForMission / parseFloat(mission.GlobalBudget || 0)) * 100).toFixed(2) + "%",
                        // Add detailed tracking
                        BudgetModifications: budgetModifications,
                        NewBudgetLines: newBudgetLines,
                        ModifiedExistingBudget: modifiedExistingBudget,
                        TableBudgetTotal: tableBudgetTotal
                    };

                    updatedMissions.push(updatedMission);

                    if (available < 0) {
                        overBudgetMissions.push({
                            MissionId: mission.MissionId,
                            description: mission.description,
                            available: available.toFixed(2),
                            totalBudgetInSTI: totalBudgetForMission.toFixed(2),
                            budgetModifications: budgetModifications.toFixed(2),
                            newBudgetLines: newBudgetLines.toFixed(2),
                            modifiedExistingBudget: modifiedExistingBudget.toFixed(2)
                        });
                    }
                });

                oView.getModel("missions").setProperty("/results", updatedMissions);
                oView.getModel("missions").refresh(true);

                if (overBudgetMissions.length > 0 && showAlert) {
                    // Update timestamp
                    this._lastBudgetAlertTime = now;

                    var message = "ATTENTION : " + overBudgetMissions.length + " mission(s) dépasse(nt) le budget disponible :\n\n";

                    overBudgetMissions.forEach((m, index) => {
                        message += `${index + 1}. Mission '${m.description}' (${m.MissionId})\n`;
                        message += `   Budget sous-traité: ${m.totalBudgetInSTI}\n`;
                        message += `   (Dont nouvelles lignes: ${m.newBudgetLines})\n`;
                        message += `   (Dont lignes modifiées: ${m.modifiedExistingBudget})\n`;
                        message += `   Ajustements: ${m.budgetModifications}\n`;
                        message += `   Disponible: ${m.available}\n`;
                        if (index < overBudgetMissions.length - 1) {
                            message += "\n";
                        }
                    });

                    sap.m.MessageBox.warning(message, {
                        title: "Attention - Budget dépassé",
                        actions: [sap.m.MessageBox.Action.OK],
                        onClose: function () {
                            // Reset timer after alert closes
                            this._lastBudgetAlertTime = 0;
                        }.bind(this)
                    });
                }

                this.prepareMissionsTreeData();
            },

            _recalculateMissionBudgets1: function () {
                var oView = this.getView();
                var budgetData = oView.getModel("budget").getProperty("/results");
                var modifBudgetData = oView.getModel("modifBudget").getProperty("/results") || [];

                // Get the missions model from the view
                var missionsModel = oView.getModel("missions");

                // Initialize original missions model if it doesn't exist
                //if (!this._originalMissionsModel) {
                var missionsData = missionsModel.getProperty("/results") || [];
                this._originalMissionsModel = {
                    data: JSON.parse(JSON.stringify(missionsData)),
                    lastUpdated: new Date().getTime()
                };
                //}


                // Now use the stored original data
                var missionsData = this._originalMissionsModel.data;

                // Flag pour éviter les alertes multiples
                if (!this._lastBudgetAlertTime) {
                    this._lastBudgetAlertTime = 0;
                }
                var now = new Date().getTime();
                var showAlert = (now - this._lastBudgetAlertTime) > 5000; // 5 secondes entre les alertes

                var overBudgetMissions = [];
                var updatedMissions = [];

                // Group modifBudget data by mission for easier calculation
                var modifBudgetByMission = {};
                modifBudgetData.forEach(modif => {
                    var missionId = modif.Mission_e; // Mission réceptrice
                    var delta = parseFloat(modif.DeltaBudget || 0);

                    if (!modifBudgetByMission[missionId]) {
                        modifBudgetByMission[missionId] = 0;
                    }
                    modifBudgetByMission[missionId] += delta;
                });

                missionsData.forEach(mission => {
                    const missionId = mission.MissionId;
                    const originalDatabaseBudgetInSTI = parseFloat(mission.BudgetInSTI || 0);

                    // Sum ALL current budget values from the UI table for this mission
                    const currentTableBudget = budgetData && budgetData.length > 0 ?
                        budgetData
                            .filter(b => b.Mission_e === missionId)
                            .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0) :
                        0;

                    // Sum budget modifications for this mission
                    const budgetModifications = modifBudgetByMission[missionId] || 0;

                    // TOTAL BudgetInSTI = Database value + Current table values + Budget modifications
                    const totalBudgetForMission = originalDatabaseBudgetInSTI + currentTableBudget + budgetModifications;

                    const available = parseFloat(mission.GlobalBudget || 0) - totalBudgetForMission;

                    const updatedMission = {
                        ...mission,
                        OriginalBudgetInSTI: totalBudgetForMission,
                        BudgetInSTI: totalBudgetForMission.toFixed(2),
                        AvailableBudget: available.toFixed(2),
                        SubcontractedBudgetPercentage: parseFloat(mission.GlobalBudget || 0) === 0 ?
                            "0%" : ((totalBudgetForMission / parseFloat(mission.GlobalBudget || 0)) * 100).toFixed(2) + "%",
                        // Add budget modifications for reference if needed
                        BudgetModifications: budgetModifications
                    };

                    updatedMissions.push(updatedMission);

                    if (available < 0) {
                        overBudgetMissions.push({
                            MissionId: mission.MissionId,
                            description: mission.description,
                            available: available.toFixed(2),
                            totalBudgetInSTI: totalBudgetForMission.toFixed(2),
                            budgetModifications: budgetModifications.toFixed(2)
                        });
                    }
                });

                oView.getModel("missions").setProperty("/results", updatedMissions);
                oView.getModel("missions").refresh(true);

                if (overBudgetMissions.length > 0 && showAlert) {
                    // Mettre à jour le timestamp
                    this._lastBudgetAlertTime = now;

                    var message = "ATTENTION : " + overBudgetMissions.length + " mission(s) dépasse(nt) le budget disponible :\n\n";

                    overBudgetMissions.forEach((m, index) => {
                        message += `${index + 1}. Mission '${m.description}' (${m.MissionId})\n`;
                        message += `   Budget sous-traité: ${m.totalBudgetInSTI}\n`;
                        message += `   Ajustements: ${m.budgetModifications}\n`;
                        message += `   Disponible: ${m.available}\n`;
                        if (index < overBudgetMissions.length - 1) {
                            message += "\n";
                        }
                    });

                    sap.m.MessageBox.warning(message, {
                        title: "Attention - Budget dépassé",
                        actions: [sap.m.MessageBox.Action.OK],
                        onClose: function () {
                            // Réinitialiser le timer après fermeture de l'alerte
                            this._lastBudgetAlertTime = 0;
                        }.bind(this)
                    });
                }

                this.prepareMissionsTreeData();
            },

            _recalculateMissionBudgets1: function () {
                var oView = this.getView();
                var budgetData = oView.getModel("budget").getProperty("/results");
                var missionsData = oView.getModel("missions").getProperty("/results");


                // First, get the missions model from the view
                var missionsModel = oView.getModel("missions");

                // Initialize original missions model if it doesn't exist
                if (!this._originalMissionsModel) {
                    var missionsData = missionsModel.getProperty("/results") || [];
                    this._originalMissionsModel = {
                        data: JSON.parse(JSON.stringify(missionsData)),
                        lastUpdated: new Date().getTime()
                    };
                }

                // Now use the stored original data
                var missionsData = this._originalMissionsModel.data;

                // Flag pour éviter les alertes multiples
                if (!this._lastBudgetAlertTime) {
                    this._lastBudgetAlertTime = 0;
                }
                var now = new Date().getTime();
                var showAlert = (now - this._lastBudgetAlertTime) > 5000; // 5 secondes entre les alertes

                var overBudgetMissions = [];
                var updatedMissions = [];

                missionsData.forEach(mission => {
                    const missionId = mission.MissionId;
                    const originalDatabaseBudgetInSTI = parseFloat(mission.BudgetInSTI || 0);

                    // Sum ALL current budget values from the UI table for this mission
                    const currentTableBudget = budgetData && budgetData.length > 0 ?
                        budgetData
                            .filter(b => b.Mission_e === missionId)
                            .reduce((acc, b) => acc + parseFloat(b.BudgetAlloue || 0), 0) :
                        0;

                    // TOTAL BudgetInSTI = Database value + Current table values
                    const totalBudgetForMission = originalDatabaseBudgetInSTI + currentTableBudget;

                    const available = parseFloat(mission.GlobalBudget || 0) - totalBudgetForMission;

                    const updatedMission = {
                        ...mission,
                        OriginalBudgetInSTI: totalBudgetForMission,
                        BudgetInSTI: totalBudgetForMission.toFixed(2),
                        AvailableBudget: available.toFixed(2),
                        SubcontractedBudgetPercentage: parseFloat(mission.GlobalBudget || 0) === 0 ?
                            "0%" : ((totalBudgetForMission / parseFloat(mission.GlobalBudget || 0)) * 100).toFixed(2) + "%"
                    };

                    updatedMissions.push(updatedMission);

                    if (available < 0) {
                        overBudgetMissions.push({
                            MissionId: mission.MissionId,
                            description: mission.description,
                            available: available.toFixed(2),
                            totalBudgetInSTI: totalBudgetForMission.toFixed(2)
                        });
                    }
                });

                oView.getModel("missions").setProperty("/results", updatedMissions);
                oView.getModel("missions").refresh(true);

                if (overBudgetMissions.length > 0 && showAlert) {
                    // Mettre à jour le timestamp
                    this._lastBudgetAlertTime = now;

                    var message = "ATTENTION : " + overBudgetMissions.length + " mission(s) dépasse(nt) le budget disponible :\n\n";

                    overBudgetMissions.forEach((m, index) => {
                        message += `${index + 1}. Mission '${m.description}' (${m.MissionId})\n`;
                        message += `   Budget sous-traité: ${m.totalBudgetInSTI}, Disponible: ${m.available}\n`;
                        if (index < overBudgetMissions.length - 1) {
                            message += "\n";
                        }
                    });

                    sap.m.MessageBox.warning(message, {
                        title: "Attention - Budget dépassé",
                        actions: [sap.m.MessageBox.Action.OK],
                        onClose: function () {
                            // Réinitialiser le timer après fermeture de l'alerte
                            this._lastBudgetAlertTime = 0;
                        }.bind(this)
                    });
                }

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

                    const sPath = oContext.getPath();

                    // Store current values of important fields before refresh
                    const fieldsToPreserve = [
                        "business_no_p",
                        "business_no_e",
                        "business_p_ufo",
                        "business_p_cdp",
                        "id_formulaire",
                        "status"
                    ];

                    const preservedValues = {};
                    fieldsToPreserve.forEach(field => {
                        preservedValues[field] = oModel.getProperty(sPath + "/" + field);
                    });

                    // Store current mission data
                    const currentMissions = oView.getModel("missions")?.getProperty("/results") || [];
                    const missionsWithOriginalValues = currentMissions.map(mission => ({
                        ...mission,
                        OriginalBudgetInSTI: mission.OriginalBudgetInSTI || parseFloat(mission.BudgetInSTI || 0)
                    }));

                    // Refresh main model
                    oModel.refresh(true).then(() => {
                        // Restore preserved values after refresh
                        fieldsToPreserve.forEach(field => {
                            if (preservedValues[field] !== undefined &&
                                preservedValues[field] !== null &&
                                preservedValues[field] !== oModel.getProperty(sPath + "/" + field)) {
                                oModel.setProperty(sPath + "/" + field, preservedValues[field]);
                            }
                        });

                        // Refresh secondary data
                        return Promise.all([
                            this.getBudget(),
                            this.getModifBudget(),
                            this.getMissions(),
                            this.getWF(),
                            this.getComments()
                        ]);
                    }).then(([budget, modifBudget, missions, wf, comments]) => {
                        // Update all models
                        this._updateAllModels(oView, budget, modifBudget, missions, wf, comments, missionsWithOriginalValues);

                        sap.m.MessageToast.show("Data refreshed successfully");

                        this._recalculateMissionBudgets();
                        this.prepareMissionsTreeData();

                        if (status !== 'DRAFT') {
                            const oRouter = sap.ui.core.UIComponent.getRouterFor(oView);
                            oRouter.navTo("ListReport");
                        }

                    }).catch(error => {
                        console.error("Error refreshing data:", error);
                        sap.m.MessageToast.show("Error refreshing data");
                    }).finally(() => {
                        oView.setBusy(false);
                    });

                } catch (error) {
                    console.error("Error in _refreshScreenData:", error);
                    oView.setBusy(false);
                }
            },

            _updateAllModels: function (oView, budget, modifBudget, missions, wf, comments, missionsWithOriginalValues) {
                // Helper function to update models
                const models = [
                    { name: "budget", data: { results: budget } },
                    { name: "modifBudget", data: { results: modifBudget } },
                    { name: "wf", data: { results: wf } }
                ];

                models.forEach(modelInfo => {
                    if (oView.getModel(modelInfo.name)) {
                        oView.getModel(modelInfo.name).setData(modelInfo.data);
                    }
                });

                // Handle comments
                if (oView.getModel("comments")) {
                    var oGrouped = this._groupCommentLines(comments);
                    oView.getModel("comments").setData(oGrouped);
                }

                // Handle missions with preserved original values
                if (oView.getModel("missions")) {
                    const updatedMissions = missions.map(mission => {
                        const preservedMission = missionsWithOriginalValues.find(m =>
                            m.MissionId === mission.MissionId
                        );
                        return {
                            ...mission,
                            OriginalBudgetInSTI: preservedMission ?
                                preservedMission.OriginalBudgetInSTI :
                                parseFloat(mission.BudgetInSTI || 0)
                        };
                    });
                    oView.getModel("missions").setData({ results: updatedMissions });
                }
            },


            _refreshScreenData1: function (oView, status) {
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
                        this.getModifBudget(),
                        this.getMissions(),
                        this.getWF(),
                        this.getComments()
                    ]).then(([budget, modifBudget, missions, wf, comments]) => {
                        // Update budget model
                        if (oView.getModel("budget")) {
                            oView.getModel("budget").setData({ results: budget });
                        }
                        // Update budget model
                        if (oView.getModel("modifBudget")) {
                            oView.getModel("modifBudget").setData({ results: modifBudget });
                        }
                        // Update wf model
                        if (oView.getModel("wf")) {
                            oView.getModel("wf").setData({ results: wf });
                        }
                        // Update comments model
                        if (oView.getModel("comments")) {
                            var oGrouped = this._groupCommentLines(comments);
                            oView.getModel("comments").setData(oGrouped);
                            //  oView.getModel("comments").setData({ results: comments });
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


            _callZCHECK_INTERCOAction: function (IV_BUSINESS_NO_E, IV_UFO_P) {
                return new Promise((resolve, reject) => {
                    try {
                        const oModel = this.getView().getModel();

                        // Prepare the parameter object
                        const oParams = {
                            IV_BUSINESS_NO_E: IV_BUSINESS_NO_E,
                            IV_UFO_P: IV_UFO_P
                        };

                        // Call the action with parameters
                        oModel.callFunction("/ZCHECK_INTERCO", {
                            method: "POST", // Usually POST for actions with parameters
                            urlParameters: oParams,
                            success: (oData) => {
                                console.log("ZCHECK_INTERCO action successful:", oData);
                                resolve(oData.ZCHECK_INTERCO.ZExist);
                            },
                            error: (oError) => {
                                console.error("Error calling ZCHECK_INTERCO action:", oError);
                                reject(oError);
                            }
                        });
                    } catch (error) {
                        console.error("Unexpected error in _callZGET_IDAction:", error);
                        reject(error);
                    }
                });
            },

            _callZCHECK_UFO_CDPAction: function (IV_BUSINESS_NO_E, IV_CDP_P) {
                return new Promise((resolve, reject) => {
                    try {
                        const oModel = this.getView().getModel();

                        // Prepare the parameter object
                        const oParams = {
                            IV_BUSINESS_NO_E: IV_BUSINESS_NO_E,
                            IV_CDP_P: IV_CDP_P
                        };

                        // Call the action with parameters
                        oModel.callFunction("/ZCHECK_UFO_CDP", {
                            method: "POST", // Usually POST for actions with parameters
                            urlParameters: oParams,
                            success: (oData) => {
                                console.log("ZCHECK_UFO_CDP action successful:", oData);
                                resolve(oData.ZCHECK_UFO_CDP.ZExist);
                            },
                            error: (oError) => {
                                console.error("Error calling ZCHECK_UFO_CDP action:", oError);
                                reject(oError);
                            }
                        });
                    } catch (error) {
                        console.error("Unexpected error in _callZCHECK_UFO_CDPAction:", error);
                        reject(error);
                    }
                });
            },

            formatModifBudgetVisible: function (bIsAvnant) {
                const oView = this.getView();
                const oUIModel = oView.getModel("ui");
                if (!oUIModel) return false;

                const bShowModifBudget = oUIModel.getProperty("/showModifBudget");
                return bIsAvnant && bShowModifBudget;
            }
        }
    }
);

