namespace tileworld {
    
    enum RuleEditorMenus { MainMenu, AttrTypeMenu, CommandMenu };
    enum CommandTokens { Last=CommandType.Last, SpaceTile, Delete };

    export class RuleEditor extends RuleVisualsBase {
        private otherCursor: Sprite;    // show correspondence between left and right

        // in-world menus
        private menu: RuleEditorMenus;  // which menu is active?
        // whendo state
        private attrSelected: number;
        // for editing commands
        private commandLengths: number[];

        private rule: number;           // the current rule
        private whenDo: number;         // which WhenDo is being edited
        private currentCommand: number; // the current command (potentially null)
        private askDeleteRule: boolean;
        
        constructor(p: Project, 
                    private kind: number, private rt: RuleType, private dir: MoveDirection) {
            super(p);

            let rules = this.currentRules();
            if (rules.length == 0) {
                rules.push(p.makeRule(kind, rt, dir));
            }
            this.rule = rules[0];
            this.askDeleteRule = false;

            // attribute menu view
            this.attrSelected = -1;

            // Control
            this.menu = RuleEditorMenus.MainMenu;

            // linked cursor
            this.otherCursor = sprites.create(cursorOut)
            this.otherCursor.setFlag(SpriteFlag.Invisible, true)
            this.otherCursor.x = 88
            this.otherCursor.y = yoff+40
            this.otherCursor.z = 50;

            // refresh display
            this.update();

            controller.A.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.askDeleteRule) {
                    let index = this.currentRules().indexOf(this.rule);
                    this.p.removeRule(this.rule);
                    let rules = this.currentRules();
                    if (rules.length == 0) {
                        game.popScene();
                        return;
                    } else {
                        this.rule = index < rules.length ? rules[index] : rules[index-1];
                    }
                    this.askDeleteRule = false;
                } else if (this.manhattanDistance2() <=2 && (this.col() != 2 || this.row() != 2)) {
                     // otherwise if we are in the diamond, bring up attr menu
                    if (this.menu == RuleEditorMenus.AttrTypeMenu) {
                        this.noMenu();
                    } else {
                        this.menu = RuleEditorMenus.AttrTypeMenu;
                        this.setTileSaved()
                    }
                } else if (this.cursor.x >= 96 && (this.cursor.y -yoff) < 80) {
                    if (this.menu == RuleEditorMenus.CommandMenu) {
                        this.noMenu();
                    } else {
                        let yes = this.tryEditCommand();
                        if (!yes) this.noMenu();
                    }
                } else if (this.menu == RuleEditorMenus.AttrTypeMenu) {
                    let yes = this.attrUpdate();
                    if (!yes) this.noMenu();
                } else if (this.menu == RuleEditorMenus.CommandMenu) {
                    this.exitCommandMenu();
                } else if (this.menu == RuleEditorMenus.MainMenu) {
                    if (this.row() == 6) {
                        if (7 <= this.col() && this.col() <= 9) {
                            // move backward/forward in rule space
                            let rules = this.currentRules();
                            let index = rules.indexOf(this.rule);
                            if (this.col() == 7 && index > 0) {
                                this.changeRule(rules[index-1]);
                            } else if (this.col() == 9 && index < rules.length-1) {
                                this.changeRule(rules[index+1]);
                            } else if (this.col() == 8 && this.rt != -1) {
                                this.changeRule(p.makeRule(this.kind, this.rt, this.dir));
                            }
                        } else if (this.col() == 3) {
                            this.askDeleteRule = true;                     
                        }
                    } 
                }
                this.update();
            })

            controller.B.onEvent(ControllerButtonEvent.Pressed, () => {
                if (this.askDeleteRule) {
                    this.askDeleteRule = false;
                } else if (this.menu != RuleEditorMenus.MainMenu) {
                    this.menu = RuleEditorMenus.MainMenu;
                } else {
                    this.saveAndPop();
                    return;
                }
                this.update();
            });
        }

        protected okToMove() {
            return !this.askDeleteRule;
        }

        private changeRule(rid: number) {
            this.p.saveRule(this.rule);
            this.rule = rid;
        }

        private saveAndPop() {
            this.p.saveRule(this.rule);
            game.popScene();
        }

        protected currentRules() {
            // TODO: sort rules by id
            let rules = this.p.getRulesForKind(this.kind);
            return this.rt == -1 ? rules : this.getRulesForTypeDir(rules, this.rt, this.dir);
        }

        protected cursorMove(dir: MoveDirection, pressed: boolean) {
            if (this.menu == RuleEditorMenus.MainMenu) {
                this.otherCursorMove();
            } else {
                if (this.menu == RuleEditorMenus.CommandMenu) {
                    this.commandUpdate();
                    this.update();
                }
            }
        }

        private otherCursorMove() {
            if (this.cursor.x >= 80 && (this.cursor.y - yoff) < 80) {
                let row = this.row();
                this.otherCursor.setFlag(SpriteFlag.Invisible, false);
                // compute mapping from right to left hand side
                this.otherCursor.x = this.rowToColCoord(row) * 16 + 8;
                this.otherCursor.y = this.rowToRowCoord(row) * 16 + 8 + yoff;
            } else {
                this.otherCursor.setFlag(SpriteFlag.Invisible, true);
            }
        }

        private noMenu() {
            this.whenDo = -1;
            this.currentCommand = -1;
            this.attrSelected = -1;
            this.menu = RuleEditorMenus.MainMenu;
            this.tileSaved.setFlag(SpriteFlag.Invisible, true);
        }
        
        private manhattanDistance2() {
            return (Math.abs(2 - this.col()) + Math.abs(2 - this.row()));
        }

        private collideCol: number;
        private collideRow: number;
        public update() {
            this.collideCol = this.collideRow = -1;
            screen.fill(11);
            screen.fillRect(0, 0, 80, 120, 12);
            screen.print("When", 0, 0);
            screen.print("Do", 80, 0);
            this.makeContext();
            this.showRuleType(this.p.getType(this.rule), this.p.getDir(this.rule), 2, 2);
            this.showCommands(); 

            if (this.menu == RuleEditorMenus.MainMenu) {
                this.showMainMenu();
            } else if (this.menu == RuleEditorMenus.AttrTypeMenu) {
                this.dirMap.fill(0xf);
                screen.fillRect(0, yoff + 80, 160, 36, 0);
                this.attrMenu()
            } else if (this.menu == RuleEditorMenus.CommandMenu) {
                screen.fillRect(0, yoff + 80, 160, 36, 0);
                this.modifyCommandMenu();
                this.commandUpdate();
            }
            if (this.askDeleteRule) {
                this.cursor.setFlag(SpriteFlag.Invisible, true)
                game.showDialog("OK to delete rule?", "", "A = OK, B = CANCEL");
            } else {
                this.cursor.setFlag(SpriteFlag.Invisible, false);
            }
        }

        protected showCollision(col: number, row: number, dir: MoveDirection, arrowImg: Image) {
            super.showCollision(col, row, dir, arrowImg);
            this.collideCol = col;
            this.collideRow = row;
        }

        centerImage() {
            return this.p.getImage(this.kind);
        }

        private showMainMenu() {
            screen.fillRect(0, yoff + (6 << 4), 160, 19, 0);
            this.fillTile(0, 6, 11);
            this.drawImage(0, 6, pencil);
            this.drawImage(1, 6, play);
            this.drawImage(2, 6, debug);
            this.drawImage(3, 6, garbageCan);
            let rules = this.currentRules();
            let index = rules.indexOf(this.rule);
            this.drawImage(9, 6, index < rules.length -1 ? rightArrow : greyImage(rightArrow));
            this.drawImage(8, 6, this.rt != -1 ? addRule : greyImage(addRule));
            this.drawImage(7, 6, index > 0 ? leftArrow : greyImage(leftArrow));
        }

        private makeContext() {
            for (let i = 0; i <= 4; i++) {
                for (let j = 0; j <= 4; j++) {
                    let dist = Math.abs(2-j) + Math.abs(2-i);
                    if (dist <= 2) {
                        // TODO: limit the context base on the rule type
                        this.drawImage(i, j, emptyTile);
                        if (i != 2 || j != 2)
                            this.showAttributes(this.rule, i, j);
                    }
                }
            }
        }

        // map from row 0-4 to (col,row) in diamond
        private rowToColCoord(lr: number) { return lr % 2 == 0 ? 2 : lr; }
        private rowToRowCoord(lr: number) { return lr == 0 ? 1 : (lr == 4 ? 3 : 2); }

        private showCommands() {
            this.commandLengths = [];
            for(let lr = 0; lr < 5; lr++) {
                let len = this.showCommandsAt(lr, this.rowToColCoord(lr), this.rowToRowCoord(lr)); 
                this.commandLengths.push(len);
            }
        }

        private tokens: number[];
        private showCommandsAt(crow: number, wcol: number, wrow: number, draw: boolean = true) {
            let whendo = this.getWhenDo(wcol, wrow);
            if (draw) {
                let index = this.findWitnessColRow(wcol, wrow);
                let img1 = this.collideCol == wcol && this.collideRow == wrow ? collisionSprite : genericSprite;
                let img2 = index == -1 ? img1 : this.p.getImage(index);
                this.drawImage(5, crow, img2);
                if (img1 == collisionSprite)
                    this.drawImage(5, crow, img1);
            }
            // show the existing commands
            let col = 6;
            let tokens = this.getTokens(wcol, wrow);
            if (!draw) { this.tokens = tokens; }
            let cid = 0
            for(; cid < 4; cid++, col++) {
                let inst = this.p.getInst(this.rule, whendo, cid);
                if (inst != -1) {
                    this.showCommand(col, crow, whendo, cid, tokens, draw);
                } else {
                    if (tokens.length > 0) {
                        this.showCommand(col, crow, whendo, cid, tokens, draw);
                    }
                    break;
                }
            }
            return cid+1;
        }

        // what instructions are possible, given rule type and witness
        // this defines the menu to present at the top-level
        private getTokens(col: number, row: number) {
            let tokens: number[] = [];
            if (this.rt == RuleType.Colliding) {
                if (col == 2 && row == 2) {
                    tokens.push(CommandType.Sprite);
                }
            } else {
                if (this.findWitnessColRow(col, row) != -1)
                    tokens.push(CommandType.Move);
                tokens.push(CommandType.Paint);
            }
            tokens.push(CommandType.SpritePred);
            tokens.push(CommandType.Game);
            return tokens;
        }

        private showCommand(col: number, row: number, 
                            whendo: number, cid: number, tokens: number[],
                            draw: boolean) {
            let inst = this.p.getInst(this.rule, whendo, cid);
            let arg = this.p.getArg(this.rule, whendo, cid);
            if (inst == -1) {
                if (draw) this.drawImage(col, row, emptyTile);
            } else {
                if (draw) this.drawImage(col, row, this.instToImage(inst,arg));
                tokens.removeElement(inst);
                col++;
            }
            return col;
        }

        private tryEditCommand() {
            let row = this.row();
            if (row > 4) return false;
            let col = this.col() - 6;
            if (col >= Math.abs(this.commandLengths[row])) return false;
            // set up the state
            this.menu = RuleEditorMenus.CommandMenu;
            this.ruleTypeMap.fill(0xf);
            this.dirMap.fill(0xf);
            let newCol = this.rowToColCoord(row);
            let newRow = this.rowToRowCoord(row);
            this.whenDo = this.getWhenDo(newCol, newRow);
            this.setTileSaved();
            this.currentCommand = col;
            if (this.p.getInst(this.rule, this.whenDo, col) == -1) {
                this.showCommandsAt(row, newCol, newRow, false);
                this.makeCommandMenu(-1,-1);
            } else {
                this.tokens = [];
                this.modifyCommandMenu();
            }
            return true;
        }

        private makeCommandMenu(inst: number, arg: number) {
            let col = 5;
            let row = 5;
            // show the categories
            // which one is currently selected?
            this.tokens.forEach(ct => {
                this.drawImage(col, row, ct < CommandType.Last ? categoryImages[ct] : garbageCan);
                this.drawOutline(col, row);
                if (inst == ct) this.drawImage(col, row, cursorOut);
                this.ruleTypeMap.setPixel(col, row, ct);
                col++;
            });
            if (inst != -1) {
                this.makeArgMenu(inst, arg);
            }
        }

        // inst must be -1, arg might be -1;
        private makeArgMenu(inst: number, arg: number) {
            let col = 4;
            let row = 6;
            this.dirMap.fill(0xf);
            let len = this.instToNumArgs(inst);
            for (let i = 0; i < len; i++) {
                this.drawImage(col, row, this.instToImage(inst, i));
                this.drawOutline(col, row);
                if (arg == i) this.drawImage(col, row, cursorOut);
                this.dirMap.setPixel(col, row, i);
                col++;
            }
        }

        private modifyCommandMenu() {
            if (this.menu != RuleEditorMenus.CommandMenu)
                return;
            let inst = this.p.getInst(this.rule, this.whenDo, this.currentCommand);
            let arg = this.p.getArg(this.rule, this.whenDo, this.currentCommand);
            if (this.tokens.length > 0) {
                this.makeCommandMenu(inst, arg);
            } else if (inst != -1) {
                this.tokens = [inst, CommandTokens.Delete];
                this.makeCommandMenu(inst, arg);
            } else {
                this.noMenu();
            }
        }

        private instToImage(inst: number, arg: number): Image {
            if (inst == -1 || arg == -1)
                return emptyTile;
            switch (inst) {
                case CommandType.Move: return moveImages[arg];
                case CommandType.Paint: return this.p.fixed()[arg];
                case CommandType.Sprite: return eat;
                case CommandType.Game: return gameImages[arg];
                case CommandType.SpritePred: {
                    let img = this.p.movable()[arg].clone();
                    img.drawTransparentImage(equalZero, 0, 0);
                    return img;
                }
            }
            return help;
        }

        private instToNumArgs(inst: number) {
            switch (inst) {
                case CommandType.Move: return this.rt != RuleType.Colliding ? 4:  5;
                case CommandType.Paint: return 3;  // TODO: goto 4
                case CommandType.Sprite: return 1;
                case CommandType.Game: return 2;
                case CommandType.SpritePred: return 4;
            }
            return 0;
        }

        private exitCommandMenu() {
            this.commandUpdate(true);
            this.noMenu();
        }

        private commandUpdate(exit: boolean = false) {
            if (this.menu != RuleEditorMenus.CommandMenu)
                return;
            let tok = this.ruleTypeMap.getPixel(this.col(), this.row());
            let arg = this.dirMap.getPixel(this.col(), this.row());
            if (tok == CommandTokens.Delete) {
                if (exit)
                    this.p.removeCommand(this.rule, this.whenDo, this.currentCommand);
            } else if (this.row() == 5 && tok != 0xf) {
                let inst = this.p.getInst(this.rule, this.whenDo, this.currentCommand);
                if (tok != inst) {
                    this.setCommand(tok, 0);
                }
            } else if (this.row() == 6 && arg != 0xf) {
                this.p.setArg(this.rule, this.whenDo, this.currentCommand, arg);
            }
        }

        private setCommand(inst: number, arg: number) {
            this.p.setInst(this.rule, this.whenDo, this.currentCommand, inst);
            this.p.setArg(this.rule, this.whenDo, this.currentCommand, arg);
        }

        private posSpritePosition(whendo: number, begin: number) {
            let index = this.attrIndex(this.rule, whendo, AttrType.Include, begin);
            return (index == -1) ? this.attrIndex(this.rule, whendo, AttrType.OneOf, begin) : index;
        }

        private findWitnessWhenDo(whendo: number) {
            if (whendo == -1)
                return -1;
            return this.posSpritePosition(whendo, this.p.fixed().length);
        }

        // what is ordering of sprites?
        // (0,0) always first
        private findWitnessColRow(col: number, row: number) {
            let whendo = this.getWhenDo(col, row);
            // TODO: if this is a collision event then we have a witness
            // TODO: already identified by the red sprite (colliding into)
            // TODO: can be overridden 
            return (col != 2 || row != 2) ? this.findWitnessWhenDo(whendo) : this.kind;
        }

        private attrMenu() {
            // which tile in the diamond are we attributing?
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            // for all user-defined sprites
            attrImages.forEach((img, i) => {
                // draw 8x8 sprites centered
                screen.drawTransparentImage(img, (i << 4) + 4, yoff + (5 << 4) + 4);
                this.drawOutline(i, 5);
            });
            this.p.all().forEach((image, i ) => {
                let a = this.p.getAttr(this.rule, whenDo, i);
                this.drawImage(i, 6, image);
                this.drawImage(i, 6, attrImages[attrValues.indexOf(a)]);
                this.dirMap.setPixel(i,6,a);
            });
            if (this.attrSelected == -1)
                this.selectAttr(0);
            this.drawImage(this.attrSelected, 5, cursorOut);
        }

        private selectAttr(a: number) {
            this.attrSelected = a;
        }

        private attrUpdate() {
            let a = this.row() == 5 ? this.col() : -1
            if (a != -1 && a < attrValues.length) { 
                this.selectAttr(a); return true; 
            }
            let m = this.row() == 6 ? this.col() : -1; 
            if (m != -1 && m < this.p.all().length) { 
                let val = attrValues[this.attrSelected];
                if (val == AttrType.Include) { 
                    if (m < this.p.fixed().length) {
                        this.setFixedOther(m, -1, AttrType.Exclude);
                        this.setMovableOther(m, -1, AttrType.Exclude);
                    } else {
                        this.setMovableOther(m, -1, AttrType.Exclude);
                        this.setFixedOther(m, -1, AttrType.OK);
                    }
                } else if (val == AttrType.OneOf) {
                    this.setFixedOther(m, AttrType.Include, AttrType.OneOf);
                    this.setMovableOther(m, AttrType.Include, AttrType.OneOf);
                } else if (m < this.p.fixed().length) {
                    // not allowed to set all to exclude
                    let cnt = 0;
                    let i = 0;
                    for(;i<this.p.fixed().length;i++) {
                        if (this.dirMap.getPixel(6,i) == AttrType.Exclude) {
                            cnt++; if (cnt == 2) break;
                        }
                    }
                    if (cnt == 2) {
                        let whenDo = this.getWhenDo(this.col(false), this.row(false));
                        this.setAttr(i, this.p.getAttr(this.rule, whenDo, m));
                    }
                }
                this.setAttr(m, val);
                return true;
            }
            return false;
        }

        // TODO: move this out to project.ts
        private getWhenDo(col: number, row: number) {
            let whendo = this.p.getWhenDo(this.rule, col, row);
            if (whendo == -1) {
                whendo = this.p.makeWhenDo(this.rule, col, row);
                // default mapping::everything is possible
                this.p.all().forEach((img,i) => { 
                    this.p.setAttr(this.rule, whendo, i, AttrType.OK);
                });
            }
            return whendo;
        }
        
        private setFixedOther(m: number, src: number, val: number) {
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            for(let o =0; o<this.p.fixed().length; o++) {
                if (o != m) {
                    if (src == -1 || this.p.getAttr(this.rule, whenDo, o) == src)
                        this.setAttr(o, val);
                }
            }
        }
        private setMovableOther(m: number, src: number, val: number) {
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            for (let o = this.p.fixed().length; o< this.p.all().length; o++) {
                if (o != m) {
                    if (src == -1 || this.p.getAttr(this.rule, whenDo, o) == src)
                        this.setAttr(o, val);
                }
            }
        }

        private setAttr(m: number, val: AttrType) {
            let whenDo = this.getWhenDo(this.col(false), this.row(false));
            this.p.setAttr(this.rule, whenDo, m, val)
        }
    } 
}